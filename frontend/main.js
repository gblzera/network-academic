// --- CONFIGURAÇÃO ---
const VM_IP = "192.168.0.140";
// --- FIM DA CONFIGURAÇÃO ---

const API_URL = `http://${VM_IP}:8000`;
const WS_URL = `ws://${VM_IP}:8000/ws`;

// Seletores de Elementos
const chartCanvas = document.getElementById('traffic-chart').getContext('2d');
const subtitle = document.getElementById('subtitle');
const backButton = document.getElementById('back-button');
const themeToggle = document.getElementById('theme-toggle');
const connectionStatusEl = document.getElementById('connection-status');
const activeClientsEl = document.getElementById('active-clients');
const totalInboundEl = document.getElementById('total-inbound');
const totalOutboundEl = document.getElementById('total-outbound');
const lastUpdateEl = document.getElementById('last-update');
const timeRangeButtons = document.querySelectorAll('.time-btn');

// Estado da Aplicação
let trafficChart;
let currentTrafficData = {};
let currentView = 'live'; // 'live', 'history', 'drilldown'
let selectedIp = null;
let currentIpList = [];
let socket; // Tornar o socket global para gerenciá-lo
let inboundGradient, outboundGradient;

// Funções Utilitárias
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Paleta de cores para o gráfico de linha do histórico
const colorPalette = ['#38bdf8', '#fb7185', '#4ade80', '#facc15', '#a78bfa', '#2dd4bf', '#f472b6'];
let colorIndex = 0;
const getColor = () => {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
    return color;
};

// Funções de Renderização do Gráfico
const initializeChart = () => {
    trafficChart = new Chart(chartCanvas, {
        type: 'bar', // Começa como barras
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { y: { beginAtZero: true } },
            onClick: (event, elements) => {
                if ((currentView === 'live' || currentView === 'history_overview') && elements.length > 0) {
                    const rawIp = currentIpList[elements[0].index];
                    if (rawIp) switchView('drilldown', rawIp);
                }
            }
        }
    });
};

const renderLiveChart = (data) => {
    if (!trafficChart || !data.traffic) return;

    const traffic = data.traffic;
    const hosts = data.hosts || {};
    const vendors = data.vendors || {};

    const sortedIps = Object.keys(traffic).sort((a, b) => {
        const sum = ip => Object.values(traffic[ip]).reduce((acc, s) => acc + (s.in || 0) + (s.out || 0), 0);
        return sum(b) - sum(a);
    });

    currentIpList = sortedIps;
    const labels = sortedIps.map(ip => {
        const hostname = hosts[ip];
        const vendor = vendors[ip];
        const displayName = (hostname && hostname !== ip) ? hostname : ip;
        return vendor && vendor !== "Desconhecido" ? `${displayName} (${vendor})` : displayName;
    });

    const inboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, s) => sum + (s.in || 0), 0));
    const outboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, s) => sum + (s.out || 0), 0));
    
    inboundGradient = chartCanvas.createLinearGradient(0, 0, 0, 400);
    inboundGradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
    inboundGradient.addColorStop(1, 'rgba(56, 189, 248, 0.2)');

    outboundGradient = chartCanvas.createLinearGradient(0, 0, 0, 400);
    outboundGradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
    outboundGradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)');

    trafficChart.data.labels = labels;
    trafficChart.data.datasets = [
        { label: 'Entrada (In)', data: inboundData, backgroundColor: inboundGradient, borderRadius: 4 },
        { label: 'Saída (Out)', data: outboundData, backgroundColor: outboundGradient, borderRadius: 4 }
    ];

    trafficChart.config.type = 'bar';
    trafficChart.options.scales.x = { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }};
    updateThemeColors();
    trafficChart.update();
};

const renderDrillDownChart = () => {
    const traffic = currentTrafficData.traffic[selectedIp] || {};
    // AQUI A MUDANÇA: Usa os nomes dos serviços vindos do backend
    const services = Object.keys(traffic).sort();

    const inboundData = services.map(service => traffic[service].in || 0);
    const outboundData = services.map(service => traffic[service].out || 0);

    trafficChart.config.type = 'bar';
    trafficChart.data.labels = services;
    trafficChart.data.datasets = [
        { label: 'Entrada (In)', data: inboundData, backgroundColor: inboundGradient, borderRadius: 4 },
        { label: 'Saída (Out)', data: outboundData, backgroundColor: outboundGradient, borderRadius: 4 }
    ];
    updateThemeColors();
    trafficChart.update();
};

const renderHistoryChart = (data) => {
    if (!trafficChart) return;
    colorIndex = 0;
    
    trafficChart.config.type = 'line';
    
    const datasets = Object.keys(data).map(ip => {
        const color = getColor();
        const points = data[ip].map(point => ({ x: new Date(point.time + 'Z'), y: point.total }));
        return {
            label: ip, data: points, fill: false, borderColor: color,
            tension: 0.1, pointBackgroundColor: color, pointRadius: 3
        };
    });

    trafficChart.options.scales.x = {
        type: 'time',
        time: { unit: 'minute', tooltipFormat: 'dd/MM/yyyy HH:mm' },
        title: { display: true, text: 'Tempo' },
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
    };

    trafficChart.data.labels = null;
    trafficChart.data.datasets = datasets;
    updateThemeColors();
    trafficChart.update();
};

// Gerenciador de Visualização
const switchView = (view, param = null) => {
    currentView = view;
    backButton.classList.add('hidden');

    if (view === 'live') {
        subtitle.textContent = 'Visão Geral - Tráfego por Cliente (IP)';
        if (!socket || socket.readyState === WebSocket.CLOSED) connectWebSocket();
        renderLiveChart(currentTrafficData);
    } 
    else if (view === 'history') {
        const rangeText = { '15m': '15 Minutos', '1h': '1 Hora', '6h': '6 Horas' }[param];
        subtitle.textContent = `Histórico de Tráfego - Últimos ${rangeText}`;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
            setConnectionStatus('disconnected');
        }
        fetchHistory(param);
    } 
    else if (view === 'drilldown') {
        selectedIp = param;
        const hosts = currentTrafficData.hosts || {};
        const vendors = currentTrafficData.vendors || {};
        const vendorInfo = vendors[selectedIp] && vendors[selectedIp] !== "Desconhecido" ? ` - ${vendors[selectedIp]}` : '';
        const displayName = hosts[selectedIp] && hosts[selectedIp] !== selectedIp ? `${hosts[selectedIp]} (${selectedIp})` : selectedIp;
        subtitle.textContent = `Análise por Serviço - ${displayName}${vendorInfo}`;
        backButton.classList.remove('hidden');
        renderDrillDownChart();
    }
};

const fetchHistory = async (range) => {
    setConnectionStatus('connecting');
    lastUpdateEl.textContent = `Buscando histórico (${range})...`;
    try {
        const response = await fetch(`${API_URL}/api/history?range=${range}`);
        const data = await response.json();
        renderHistoryChart(data);
        setConnectionStatus('disconnected'); // Indica que não está mais em modo 'live'
        lastUpdateEl.textContent = "Exibindo dados históricos.";
    } catch (error) {
        console.error("Erro ao buscar histórico:", error);
        lastUpdateEl.textContent = "Erro ao buscar histórico.";
    }
};

backButton.addEventListener('click', () => {
    // Se estávamos vendo o histórico, volta para o histórico. Senão, para o ao vivo.
    const lastLive = document.querySelector('.time-btn[data-range="live"]');
    if (lastLive.classList.contains('active')) {
        switchView('live');
    } else {
        switchView('history', document.querySelector('.time-btn.active').dataset.range);
    }
});

// Funções de Atualização da UI
const updateStatCards = (traffic) => {
    const ips = Object.keys(traffic);
    let totalIn = 0, totalOut = 0;
    ips.forEach(ip => {
        Object.values(traffic[ip]).forEach(service => {
            totalIn += service.in || 0;
            totalOut += service.out || 0;
        });
    });
    activeClientsEl.textContent = ips.length;
    totalInboundEl.textContent = formatBytes(totalIn);
    totalOutboundEl.textContent = formatBytes(totalOut);
};

const updateLastUpdate = () => {
    lastUpdateEl.textContent = `Última atualização (Ao Vivo): ${new Date().toLocaleTimeString()}`;
};

const setConnectionStatus = (status) => {
    connectionStatusEl.classList.remove('status-connecting', 'status-connected', 'status-disconnected');
    const statusText = connectionStatusEl.querySelector('.status-text');
    if (status === 'connecting') {
        connectionStatusEl.classList.add('status-connecting');
        statusText.textContent = 'Conectando...';
    } else if (status === 'connected') {
        connectionStatusEl.classList.add('status-connected');
        statusText.textContent = 'Conectado';
    } else {
        connectionStatusEl.classList.add('status-disconnected');
        statusText.textContent = 'Offline';
    }
};

// Lógica de Conexão WebSocket
const connectWebSocket = () => {
    setConnectionStatus('connecting');
    socket = new WebSocket(WS_URL);

    socket.onopen = () => setConnectionStatus('connected');
    
    socket.onmessage = (event) => {
        currentTrafficData = JSON.parse(event.data);
        if (currentView === 'live') {
            renderLiveChart(currentTrafficData);
        }
        updateStatCards(currentTrafficData.traffic);
        updateLastUpdate();
    };

    socket.onclose = () => {
        setConnectionStatus('disconnected');
        if (currentView === 'live') {
            setTimeout(connectWebSocket, 3000);
        }
    };
    socket.onerror = (error) => socket.close();
};

// Lógica de Tema
const updateThemeColors = () => {
    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#1e293b' : '#e2e8f0';
    const secondaryColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
    
    if (!trafficChart) return;
    trafficChart.options.scales.y.ticks.color = secondaryColor;
    trafficChart.options.scales.y.title.color = secondaryColor;
    trafficChart.options.scales.y.grid.color = gridColor;
    if (trafficChart.options.scales.x) {
        trafficChart.options.scales.x.ticks.color = secondaryColor;
        trafficChart.options.scales.x.grid.color = gridColor;
        if (trafficChart.options.scales.x.title) {
            trafficChart.options.scales.x.title.color = secondaryColor;
        }
    }
    trafficChart.options.plugins.legend.labels.color = textColor;
};

themeToggle.addEventListener('change', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    updateThemeColors();
    if(trafficChart) trafficChart.update();
});

const applySavedTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.checked = true;
    }
};

// Inicialização
timeRangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        timeRangeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const range = btn.dataset.range;
        switchView(range === 'live' ? 'live' : 'history', range);
    });
});

window.onload = () => {
    applySavedTheme();
    initializeChart();
    switchView('live'); // Inicia na visão ao vivo por padrão
};