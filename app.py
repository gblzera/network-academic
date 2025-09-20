# app.py
import asyncio
import json
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Dashboard de Tráfego")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()
latest_traffic_data: Dict[str, Any] = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        if latest_traffic_data:
            await websocket.send_text(json.dumps(latest_traffic_data))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/internal/update")
async def update_traffic(data: Dict[str, Any]):
    global latest_traffic_data
    latest_traffic_data = data
    await manager.broadcast(json.dumps(data))
    return {"status": "success", "message": "data updated and broadcasted"}

# Servindo arquivos frontend
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
