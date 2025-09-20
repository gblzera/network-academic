# app.py
import asyncio
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

DB_FILE = "traffic_history.db"

def init_db():
    """Cria o banco de dados e a tabela se não existirem."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS traffic_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            client_ip TEXT NOT NULL,
            service TEXT NOT NULL,
            inbound_bytes INTEGER DEFAULT 0,
            outbound_bytes INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()

app = FastAPI(title="Server Traffic Dashboard API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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

@app.on_event("startup")
def on_startup():
    """Garante que o banco de dados seja inicializado na partida do servidor."""
    init_db()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        if latest_traffic_data: await websocket.send_text(json.dumps(latest_traffic_data))
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def store_traffic_in_db(data: Dict[str, Any]):
    """Salva o snapshot de tráfego no banco de dados SQLite."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    now = datetime.utcnow()
    
    records = []
    for ip, services in data.get("traffic", {}).items():
        for service, directions in services.items():
            records.append((now, ip, service, directions.get("in", 0), directions.get("out", 0)))
    
    if records:
        cursor.executemany("""
            INSERT INTO traffic_history (timestamp, client_ip, service, inbound_bytes, outbound_bytes)
            VALUES (?, ?, ?, ?, ?)
        """, records)
        conn.commit()
    conn.close()

@app.post("/internal/update")
async def update_traffic(data: Dict[str, Any]):
    global latest_traffic_data
    latest_traffic_data = data
    await manager.broadcast(json.dumps(data))
    store_traffic_in_db(data) # Salva no banco a cada atualização
    return {"status": "success"}

@app.get("/api/history")
async def get_history(range: str = "15m"):
    """Endpoint para buscar dados históricos agregados."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    range_map = {"15m": 15, "1h": 60, "6h": 360, "24h": 1440}
    minutes = range_map.get(range, 15)
    time_threshold = datetime.utcnow() - timedelta(minutes=minutes)

    cursor.execute("""
        SELECT strftime('%Y-%m-%d %H:%M:00', timestamp) as interval, client_ip, SUM(inbound_bytes), SUM(outbound_bytes)
        FROM traffic_history
        WHERE timestamp >= ?
        GROUP BY interval, client_ip
        ORDER BY interval
    """, (time_threshold,))
    
    rows = cursor.fetchall()
    conn.close()
    
    # Formata os dados para o frontend
    history = defaultdict(list)
    for interval, ip, inbound, outbound in rows:
        history[ip].append({
            "time": interval,
            "in": inbound,
            "out": outbound,
            "total": inbound + outbound
        })
        
    return dict(history)

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")