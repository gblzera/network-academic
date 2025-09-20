# capture.py
import time
import threading
import socket
from collections import defaultdict
from scapy.all import sniff, IP, TCP, UDP, ICMP
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
    except (socket.herror, socket.gaierror):
        hostname = ip_address

    hostname_cache[ip_address] = hostname
    return hostname

def guess_device_type(hostname_or_ip: str) -> str:
    name = hostname_or_ip.lower()

    if name in device_type_cache:
        return device_type_cache[name]

    if any(keyword in name for keyword in ["iphone", "android", "galaxy", "pixel", "phone"]):
        device = "Telefone"
    elif any(keyword in name for keyword in ["macbook", "notebook", "laptop"]):
        device = "Notebook"
    elif any(keyword in name for keyword in ["desktop", "pc", "win", "mac", "linux"]):
        device = "PC/Desktop"
    elif any(keyword in name for keyword in ["raspberry", "pi", "arduino"]):
        device = "Embarcado/IoT"
    elif any(keyword in name for keyword in ["term", "ssh", "cli"]):
        device = "Terminal"
    else:
        device = "Desconhecido"

    device_type_cache[name] = device
    return device

def get_protocol_name(pkt) -> str:
    if TCP in pkt: return "TCP"
    if UDP in pkt: return "UDP"
    if ICMP in pkt: return "ICMP"
    return "Outros"

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
                traffic_data[client_ip][protocol]['in'] += pkt_size
            else:
                client_ip = dst_ip
                traffic_data[client_ip][protocol]['out'] += pkt_size

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

        for ip in data_copy.keys():
            hostname = get_hostname(ip)
            hosts[ip] = hostname
            devices[ip] = guess_device_type(hostname)

        payload = {
            "traffic": data_copy,
            "hosts": hosts,
            "devices": devices
        }

        try:
            headers = {'Content-type': 'application/json'}
            response = requests.post(API_ENDPOINT, data=json.dumps(payload), headers=headers, timeout=2)
            print(f"[{time.strftime('%H:%M:%S')}] Dados enviados. Status: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"[{time.strftime('%H:%M:%S')}] Erro ao enviar dados para a API: {e}")

if __name__ == "__main__":
    print("Iniciando o capturador de pacotes...")
    print(f"Monitorando tráfego para o servidor: {SERVER_IP}")
    
    sender_thread = threading.Thread(target=send_data_periodically, daemon=True)
    sender_thread.start()

    try:
        sniff(prn=process_packet, store=False)
    except Exception as e:
        print(f"Erro ao iniciar o sniff: {e}. Execute com sudo.")
