# Relatório Técnico – Dashboard de Análise de Tráfego

## 1. Arquitetura do Sistema
O sistema é composto por três módulos principais:

- **Captura de Pacotes (`capture.py`)**  
  Utiliza a biblioteca **Scapy** para interceptar pacotes IP (TCP/UDP/ICMP).  
  A cada pacote, identifica:
  - IP do cliente
  - Direção (entrada/saída)
  - Protocolo/serviço (HTTP, FTP, SSH, etc.)
  - Tamanho em bytes  
  Os dados são agregados em **janelas de 5 segundos** e enviados ao backend via HTTP.

- **Backend (`app.py`)**  
  Desenvolvido com **FastAPI**, possui duas responsabilidades principais:
  - Servir os dados em tempo real via **WebSocket** para o frontend.
  - Armazenar snapshots de tráfego em um **banco SQLite**, permitindo consultas históricas.  
  Também expõe o endpoint `/api/history` que retorna dados agregados por cliente e intervalo de tempo (15m, 1h, 6h, 24h).

- **Frontend (`index.html`, `style.css`, `main.js`)**  
  Exibe o tráfego em **gráfico de barras dinâmico** (Chart.js).  
  Principais funcionalidades:
  - **Visão geral por cliente (IP)**.
  - **Drill down**: ao clicar em uma barra, detalha os serviços/protocolos usados pelo cliente.
  - Indicador de status da conexão (conectando, conectado, desconectado).
  - **Dark/Light mode** para melhor experiência visual.
  - Botões de seleção de intervalo de tempo (ao vivo, 15m, 1h, 6h).

---

## 2. Lógica de Agregação em Janelas
- Cada pacote capturado é imediatamente classificado por:
  ```
  [IP do Cliente] → [Serviço/Protocolo] → [Direção] → Bytes
  ```
- Os dados ficam em memória por **5 segundos**.
- Após esse tempo, o snapshot é:
  - Enviado para o backend (`/internal/update`).
  - Resetado em memória para nova janela.
- O backend então:
  - Atualiza todos os dashboards conectados em tempo real via WebSocket.
  - Armazena os dados no banco para futura análise.

---

## 3. Desafios Enfrentados
- **Acesso à placa de rede**: a captura de pacotes exige privilégios de root (necessário usar `sudo`).
- **Mapeamento de serviços**: muitas portas não são padrão, então criamos uma lista base (`HTTP`, `FTP`, `SSH`, etc.) e fallback como `TCP-XXXX`.
- **Sincronização**: usamos `threading.Lock` no Python para evitar condições de corrida na atualização dos dados.
- **Visualização (drill down)**: o Chart.js não suporta drill down nativo, então foi implementada lógica customizada no `main.js` para alternar datasets entre visão geral e visão por protocolo.
- **Persistência**: escolhemos **SQLite** pela simplicidade e integração fácil com Python, permitindo consultas históricas rápidas.

---

## 4. Conclusão
O sistema cumpre os requisitos:
- Captura pacotes de um servidor específico.
- Exibe tráfego em tempo real em janelas de 5 segundos.
- Permite drill down por protocolo/serviço.
- Persiste dados históricos em banco de dados.
- Interface intuitiva com suporte a dark mode.

Com esses recursos, o dashboard é uma ferramenta prática para administradores de sistemas monitorarem a comunicação de seus servidores de forma **eficiente e interativa**.

---

## 👤 Autor
Este trabalho foi desenvolvido individualmente por:

- **Gabriel Henrique Kuhn Paz - gblzera**
