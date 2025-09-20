// --- CONFIGURAÇÃO ---
const VM_IP = "192.168.0.140";
// --- FIM DA CONFIGURAÇÃO ---

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

// Estado da Aplicação
let trafficChart;
let currentTrafficData = {};
let currentView = 'overview';
let selectedIp = null;
let currentIpList = [];
let inboundGradient, outboundGradient;

// Funções Utilitárias
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Funções do Chart
const initializeChart = () => {
    trafficChart = new Chart(chartCanvas, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (value) => formatBytes(value), color: '#94a3b8' },
                    title: { display: true, text: 'Volume de Tráfego', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { color: '#e2e8f0' } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatBytes(context.parsed.y)}`
                    }
                }
            },
            onClick: (event, elements) => {
                if (currentView === 'overview' && elements.length > 0) {
                    const rawIp = currentIpList[elements[0].index];
                    if (rawIp) handleDrillDown(rawIp);
                }
            }
        }
    });
};

const updateChart = () => {
    if (!trafficChart || !currentTrafficData.traffic) return;

    const traffic = currentTrafficData.traffic;
    const hosts = currentTrafficData.hosts || {};

    // Cria os gradientes para as barras
    inboundGradient = chartCanvas.createLinearGradient(0, 0, 0, 400);
    inboundGradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
    inboundGradient.addColorStop(1, 'rgba(56, 189, 248, 0.2)');

    outboundGradient = chartCanvas.createLinearGradient(0, 0, 0, 400);
    outboundGradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
    outboundGradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)');

    if (currentView === 'overview') {
        const sortedIps = Object.keys(traffic).sort((a, b) => {
            const sum = ip => Object.values(traffic[ip]).reduce((acc, proto) => acc + (proto.in || 0) + (proto.out || 0), 0);
            return sum(b) - sum(a);
        });

        currentIpList = sortedIps;
        const labels = sortedIps.map(ip => {
            const hostname = hosts[ip];
            return (hostname && hostname !== ip) ? `${hostname} (${ip})` : ip;
        });

        const inboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, proto) => sum + (proto.in || 0), 0));
        const outboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, proto) => sum + (proto.out || 0), 0));

        trafficChart.data.labels = labels;
        trafficChart.data.datasets = [
            { label: 'Entrada (In)', data: inboundData, backgroundColor: inboundGradient, borderRadius: 4 },
            { label: 'Saída (Out)', data: outboundData, backgroundColor: outboundGradient, borderRadius: 4 }
        ];
    } else if (currentView === 'drilldown' && selectedIp) {
        const protocols = Object.keys(traffic[selectedIp] || {}).sort();
        const inboundData = protocols.map(proto => traffic[selectedIp][proto].in || 0);
        const outboundData = protocols.map(proto => traffic[selectedIp][proto].out || 0);

        trafficChart.data.labels = protocols;
        trafficChart.data.datasets = [
            { label: 'Entrada (In)', data: inboundData, backgroundColor: inboundGradient, borderRadius: 4 },
            { label: 'Saída (Out)', data: outboundData, backgroundColor: outboundGradient, borderRadius: 4 }
        ];
    }

    updateThemeColors();
    trafficChart.update();
};

const handleDrillDown = (ip) => {
    currentView = 'drilldown';
    selectedIp = ip;
    const hosts = currentTrafficData.hosts || {};
    const displayName = hosts[ip] && hosts[ip] !== ip ? `${hosts[ip]} (${ip})` : ip;
    subtitle.textContent = `Análise Detalhada por Protocolo - ${displayName}`;
    backButton.classList.remove('hidden');
    updateChart();
};

const handleDrillUp = () => {
    currentView = 'overview';
    selectedIp = null;
    subtitle.textContent = 'Visão Geral - Tráfego por Cliente (IP)';
    backButton.classList.add('hidden');
    updateChart();
};

backButton.addEventListener('click', handleDrillUp);

// Funções de Atualização da UI
const updateStatCards = (traffic) => {
    const ips = Object.keys(traffic);
    let totalIn = 0;
    let totalOut = 0;

    ips.forEach(ip => {
        Object.values(traffic[ip]).forEach(proto => {
            totalIn += proto.in || 0;
            totalOut += proto.out || 0;
        });
    });

    activeClientsEl.textContent = ips.length;
    totalInboundEl.textContent = formatBytes(totalIn);
    totalOutboundEl.textContent = formatBytes(totalOut);
};

const updateLastUpdate = () => {
    lastUpdateEl.textContent = `Última atualização: ${new Date().toLocaleTimeString()}`;
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
        statusText.textContent = 'Desconectado';
    }
};

// Lógica de Conexão WebSocket
const connectWebSocket = () => {
    setConnectionStatus('connecting');
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log("Conectado ao servidor.");
        setConnectionStatus('connected');
    };

    socket.onmessage = (event) => {
        currentTrafficData = JSON.parse(event.data);
        updateChart();
        updateStatCards(currentTrafficData.traffic);
        updateLastUpdate();
    };

    socket.onclose = () => {
        console.log("Conexão fechada. Tentando reconectar em 3s...");
        setConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error("Erro WebSocket:", error);
        socket.close();
    };
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
    trafficChart.options.scales.x.ticks.color = secondaryColor;
    trafficChart.options.scales.x.grid.color = gridColor;
    trafficChart.options.plugins.legend.labels.color = textColor;
};

themeToggle.addEventListener('change', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    updateThemeColors();
    trafficChart.update();
});

const applySavedTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.checked = true;
    }
};

// Inicialização
window.onload = () => {
    applySavedTheme();
    initializeChart();
    connectWebSocket();
};