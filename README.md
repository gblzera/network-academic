# Dashboard de Análise de Tráfego de Servidor em Tempo Real

## 📌 Descrição
Este projeto implementa um sistema completo para **monitoramento de tráfego de rede em tempo real** de um servidor específico.  
Ele captura pacotes diretamente da interface de rede, processa os dados em **janelas de 5 segundos** e exibe em um **dashboard interativo** com drill down por protocolo/serviço.

---

## ⚙️ Arquitetura
- **Captura de Pacotes**: `capture.py` usa [Scapy](https://scapy.net/) para interceptar o tráfego de/para o servidor alvo.
- **Backend (API + WebSocket)**: `app.py` com [FastAPI](https://fastapi.tiangolo.com/).
  - Recebe dados via `/internal/update`.
  - Transmite ao frontend via **WebSocket**.
  - Persiste histórico no **SQLite**.
- **Frontend**: (`index.html`, `style.css`, `main.js`)
  - Visualização com **Chart.js**.
  - Drill down clicando em uma barra → detalha por serviço/protocolo.
  - Dark/Light mode.
  - Indicador de conexão em tempo real.

---

## 🚀 Como Executar

### 1. Pré-requisitos
- Python 3.9+
- Node.js (opcional, apenas se quiser rodar linting no JS)
- Bibliotecas Python:
  ```bash
  pip install -r requirements.txt
  ```
  Conteúdo esperado no `requirements.txt`:
  ```
  fastapi
  uvicorn
  scapy
  requests
  ```
  *(O SQLite já vem embutido no Python)*

### 2. Configuração
- Edite `capture.py` e defina o IP do servidor que deseja monitorar:
  ```python
  SERVER_IP = "192.168.0.140"  # seu servidor alvo
  ```
- Confirme a interface de rede usada pelo `scapy` (por padrão ele detecta automaticamente).

### 3. Executar o Backend
```bash
python app.py
```
O backend sobe em `http://127.0.0.1:8000`.

### 4. Executar o Capturador
```bash
sudo python capture.py
```
*(sudo pode ser necessário para acesso à placa de rede).*

### 5. Acessar o Dashboard
Abra no navegador:
```
http://127.0.0.1:8000
```

---

## 🎮 Testes
1. Configure serviços no servidor alvo: **HTTP, FTP, SSH**.
2. Acesse-os a partir de **pelo menos 5 clientes diferentes**.
3. Veja o dashboard atualizar a cada 5s com o tráfego por cliente.
4. Clique em uma barra → drill down por protocolo/serviço.
5. Use o botão **Voltar para Visão Geral** para retornar.

---

## 📂 Estrutura de Pastas
```
.
├── app.py          # Backend FastAPI + WebSocket + SQLite
├── capture.py      # Captura e envio de pacotes via Scapy
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── main.js
├── traffic_history.db   # Banco de dados gerado automaticamente
└── README.md
```

---

## 👤 Autor
Este projeto foi desenvolvido individualmente por:

- **Gabriel Henrique Kuhn Paz - gblzera**
