# capture.py
import time
import threading
import socket
from collections import defaultdict
from scapy.all import sniff, IP, TCP, UDP, ICMP
from scapy.layers.http import HTTPRequest
import requests
import json

# --- CONFIGURAÇÃO ---
SERVER_IP = "192.168.0.140"
API_ENDPOINT = "http://127.0.0.1:8000/internal/update"
TIME_WINDOW = 5
# --- FIM DA CONFIGURAÇÃO ---

hostname_cache = {}
device_type_cache = {}
traffic_data = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
data_lock = threading.Lock()

def get_hostname(ip_address: str) -> str:
    if ip_address in hostname_cache:
        return hostname_cache[ip_address]
    try:
        hostname, _, _ = socket.gethostbyaddr(ip_address)
        hostname_cache[ip_address] = hostname
        return hostname
    except (socket.herror, socket.gaierror):
        hostname = ip_address
        hostname_cache[ip_address] = hostname
        return hostname

def get_protocol_name(pkt) -> str:
    if TCP in pkt: return "TCP"
    if UDP in pkt: return "UDP"
    if ICMP in pkt: return "ICMP"
    return "Outros"

def guess_device_type(hostname: str) -> str:
    h = hostname.lower()
    if any(x in h for x in ["iphone", "android", "mobile", "phone"]): return "Telefone"
    if any(x in h for x in ["laptop", "notebook"]): return "Notebook"
    if any(x in h for x in ["desktop", "pc"]): return "PC"
    if any(x in h for x in ["raspberry", "pi"]): return "Dispositivo Embedded"
    if any(x in h for x in ["server", "vm"]): return "Servidor/VM"
    return "Desconhecido"

def process_packet(pkt):
    if IP not in pkt:
        return

    src_ip = pkt[IP].src
    dst_ip = pkt[IP].dst

    if src_ip == SERVER_IP or dst_ip == SERVER_IP:
        pkt_size = len(pkt)
        protocol = get_protocol_name(pkt)

        with data_lock:
            if dst_ip == SERVER_IP:
                client_ip = src_ip
                direction = 'in'
            else:
                client_ip = dst_ip
                direction = 'out'

            traffic_data[client_ip][protocol][direction] += pkt_size

            if pkt.haslayer(HTTPRequest):
                try:
                    ua = pkt[HTTPRequest].fields.get("User_Agent")
                    if ua:
                        ua_str = ua.decode("utf-8", errors="ignore") if isinstance(ua, bytes) else str(ua)
                        device_type_cache[client_ip] = ua_str
                except Exception:
                    pass

def send_data_periodically():
    global traffic_data
    while True:
        time.sleep(TIME_WINDOW)
        with data_lock:
            if not traffic_data:
                continue
            data_copy = json.loads(json.dumps(traffic_data))
            traffic_data.clear()

        hosts = {}
        devices = {}
        user_agents = {}

        for ip in data_copy.keys():
            hosts[ip] = get_hostname(ip)
            devices[ip] = guess_device_type(hosts[ip])
            if ip in device_type_cache:
                user_agents[ip] = device_type_cache[ip]

        payload = {
            "traffic": data_copy,
            "hosts": hosts,
            "devices": devices,
            "userAgents": user_agents
        }

        try:
            headers = {'Content-type': 'application/json'}
            response = requests.post(API_ENDPOINT, data=json.dumps(payload), headers=headers, timeout=2)
            print(f"[{time.strftime('%H:%M:%S')}] Dados enviados. Status: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"[{time.strftime('%H:%M:%S')}] Erro ao enviar dados: {e}")

if __name__ == "__main__":
    print("Iniciando captura...")
    print(f"Monitorando tráfego com destino/origem: {SERVER_IP}")
    threading.Thread(target=send_data_periodically, daemon=True).start()
    try:
        sniff(prn=process_packet, store=False)
    except Exception as e:
        print(f"Erro ao capturar pacotes: {e}")
