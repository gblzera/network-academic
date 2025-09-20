# app.py
import asyncio
import json
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Server Traffic Dashboard API")

class ConnectionManager:
    """Gerencia conexões WebSocket ativas para broadcast de mensagens."""
    def __init__(self) -> None:
        """Inicializa o gerenciador com uma lista vazia de conexões."""
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """
        Aceita uma nova conexão WebSocket e a adiciona à lista de conexões ativas.

        Args:
            websocket: O objeto WebSocket da nova conexão.
        """
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Remove uma conexão WebSocket da lista de conexões ativas.

        Args:
            websocket: O objeto WebSocket a ser desconectado.
        """
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str) -> None:
        """
        Envia uma mensagem para todas as conexões WebSocket ativas.

        Args:
            message: A mensagem (string) a ser enviada.
        """
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()
latest_traffic_data: Dict[str, Any] = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Endpoint WebSocket para clientes (frontend) se conectarem.
    Envia dados de tráfego em tempo real.
    """
    await manager.connect(websocket)
    try:
        if latest_traffic_data:
            await websocket.send_text(json.dumps(latest_traffic_data))
        while True:
            # Mantém a conexão aberta para receber broadcasts
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/internal/update")
async def update_traffic(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Endpoint interno, chamado pelo capture.py, para receber novos dados de tráfego.
    Armazena os dados e os transmite para todos os clientes conectados.
    """
    global latest_traffic_data
    latest_traffic_data = data
    await manager.broadcast(json.dumps(data))
    return {"status": "success", "message": "data updated and broadcasted"}

# Monta a pasta 'frontend' para servir os arquivos estáticos.
# Esta deve ser a última rota declarada.
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")