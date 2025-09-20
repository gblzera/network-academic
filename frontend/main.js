// --- CONFIGURAÇÃO ---
// !!! MUITO IMPORTANTE: Use o IP da sua VM, não localhost ou 127.0.0.1 !!!
const VM_IP = "192.168.0.140";
// --- FIM DA CONFIGURAÇÃO ---

const WS_URL = `ws://${VM_IP}:8000/ws`;

const chartCanvas = document.getElementById('traffic-chart').getContext('2d');
const subtitle = document.getElementById('subtitle');
const backButton = document.getElementById('back-button');
const breadcrumb = document.getElementById('breadcrumb');
const themeToggle = document.getElementById('theme-toggle');

let trafficChart;
let currentTrafficData = {};
let currentView = 'overview';
let selectedIp = null;
let currentIpList = [];

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getDeviceInfo = () => {
  const parser = new UAParser();
  const device = parser.getDevice();      // { type, vendor, model }
  const os = parser.getOS();             // { name, version }
  // device.type pode ser: “mobile”, “tablet”, “desktop”, undefined, etc.
  const browser = parser.getBrowser();   // info opcional
  return {
    type: device.type || 'desktop',
    vendor: device.vendor || '',
    model: device.model || '',
    osName: os.name || '',
    osVersion: os.version || '',
    browserName: browser.name || '',
    browserVersion: browser.version || ''
  };
};

const initializeChart = () => {
  trafficChart = new Chart(chartCanvas, {
    type: 'bar',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatBytes(value),
            color: getCurrentTextColor()
          },
          title: {
            display: true,
            text: 'Volume de Tráfego',
            color: getCurrentTextColor()
          },
          grid: { color: getCurrentGridColor() }
        },
        x: {
          ticks: { color: getCurrentTextColor() },
          grid: { color: getCurrentGridColor() }
        }
      },
      plugins: {
        legend: {
          labels: { color: getCurrentTextColor() }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatBytes(context.parsed.y)}`
          }
        }
      },
      onClick: (event, elements) => {
        if (currentView === 'overview' && elements.length > 0) {
          const clickedIndex = elements[0].index;
          const rawIp = currentIpList[clickedIndex];
          if (rawIp) handleDrillDown(rawIp);
        }
      }
    }
  });
};

function getCurrentTextColor() {
  // Se estiver em dark mode (sem class light-mode), texto branco, senão cor escura
  return document.body.classList.contains('light-mode')
    ? getComputedStyle(document.documentElement).getPropertyValue('--secondary-text')
    : '#ffffff';
}

function getCurrentGridColor() {
  return document.body.classList.contains('light-mode')
    ? 'rgba(0, 0, 0, 0.1)'
    : 'rgba(255, 255, 255, 0.05)';
}

const updateChart = () => {
  if (!trafficChart || !currentTrafficData.traffic) return;

  const traffic = currentTrafficData.traffic;
  const hosts = currentTrafficData.hosts || {};
  const hostsDevices = currentTrafficData.hostsDevices || {}; 
  // supondo que o servidor envie { hostsDevices: { ip: "PC/Desktop" / "Mobile Android"/ etc } }
  // Se não for enviado, podemos usar um fallback: detectar dispositivo com base no userAgent do cliente do dashboard

  if (currentView === 'overview') {
    const sortedIps = Object.keys(traffic).sort((a, b) => {
      const sum = ip => Object.values(traffic[ip]).reduce((acc, proto) => acc + (proto.in || 0) + (proto.out || 0), 0);
      return sum(b) - sum(a);
    });

    currentIpList = sortedIps;
    const labels = sortedIps.map(ip => {
      const hostname = hosts[ip];
      const deviceInfo = hostsDevices[ip];
      let deviceSuffix = '';
      if (deviceInfo) {
        deviceSuffix = ` — ${deviceInfo}`; 
      }
      const displayName = hostname && hostname !== ip ? `${hostname} (${ip})` : ip;
      return `${displayName}${deviceSuffix}`;
    });

    const inboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, proto) => sum + (proto.in || 0), 0));
    const outboundData = sortedIps.map(ip => Object.values(traffic[ip]).reduce((sum, proto) => sum + (proto.out || 0), 0));

    trafficChart.data.labels = labels;
    trafficChart.data.datasets = [
      { label: 'Entrada (In)', data: inboundData, backgroundColor: 'rgba(54, 162, 235, 0.7)' },
      { label: 'Saída (Out)', data: outboundData, backgroundColor: 'rgba(255, 99, 132, 0.7)' }
    ];
  } else if (currentView === 'drilldown' && selectedIp) {
    const protocols = Object.keys(traffic[selectedIp] || {});
    const inboundData = protocols.map(proto => traffic[selectedIp][proto].in || 0);
    const outboundData = protocols.map(proto => traffic[selectedIp][proto].out || 0);

    trafficChart.data.labels = protocols;
    trafficChart.data.datasets = [
      { label: 'Entrada (In)', data: inboundData, backgroundColor: 'rgba(54, 162, 235, 0.7)' },
      { label: 'Saída (Out)', data: outboundData, backgroundColor: 'rgba(255, 99, 132, 0.7)' }
    ];
  }

  updateChartColors(); 
  updateLastUpdate();
  trafficChart.update();
};

function updateChartColors() {
  // Atualiza cores de texto / eixo do gráfico para refletir o tema
  trafficChart.options.scales.y.ticks.color = getCurrentTextColor();
  trafficChart.options.scales.y.title.color = getCurrentTextColor();
  trafficChart.options.scales.y.grid.color = getCurrentGridColor();

  trafficChart.options.scales.x.ticks.color = getCurrentTextColor();
  trafficChart.options.scales.x.grid.color = getCurrentGridColor();

  trafficChart.options.plugins.legend.labels.color = getCurrentTextColor();
}

const updateLastUpdate = () => {
  const now = new Date();
  document.getElementById('last-update').textContent =
    `Última atualização: ${now.toLocaleTimeString()}`;
};

const handleDrillDown = (ip) => {
  currentView = 'drilldown';
  selectedIp = ip;
  const hosts = currentTrafficData.hosts || {};
  const displayHostname = hosts[ip] && hosts[ip] !== ip ? `${hosts[ip]} (${ip})` : ip;
  subtitle.textContent = `Análise Detalhada - Cliente: ${displayHostname}`;
  breadcrumb.textContent = `📁 Detalhes de ${ip}`;
  backButton.classList.remove('hidden');
  updateChart();
};

const handleDrillUp = () => {
  currentView = 'overview';
  selectedIp = null;
  subtitle.textContent = 'Visão Geral - Tráfego por Cliente (IP)';
  breadcrumb.textContent = '📊 Visão Geral';
  backButton.classList.add('hidden');
  updateChart();
};

backButton.addEventListener('click', handleDrillUp);

const connectWebSocket = () => {
  console.log("Conectando ao WebSocket...");
  const socket = new WebSocket(WS_URL);

  socket.onopen = () => console.log("Conectado ao servidor.");
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Espera que servidor envie algo como:
    // {
    //   traffic: { ... },
    //   hosts: { ip: hostname, ... },
    //   hostsDevices: { ip: "Desktop Windows", ip2: "iPhone", ... }
    // }
    currentTrafficData = data;
    updateChart();
  };

  socket.onclose = () => {
    console.log("Conexão fechada. Tentando reconectar em 2s...");
    setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = (error) => {
    console.error("Erro WebSocket:", error);
    socket.close();
  };
};

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
  // Após mudar tema, atualizar gráfico para aplicar novas cores
  updateChart();
});

window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    themeToggle.checked = true;
  }
});

window.onload = () => {
  initializeChart();
  connectWebSocket();
};
