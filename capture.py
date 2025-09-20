# capture.py
import time
import threading
import socket
from collections import defaultdict
from scapy.all import sniff, IP, TCP, UDP, ICMP, Ether
import requests
import json
from typing import Dict, Any

# --- CONFIGURAÇÃO ---
SERVER_IP = "192.168.0.140"
API_ENDPOINT = "http://127.0.0.1:8000/internal/update"
TIME_WINDOW = 5
# --- FIM DA CONFIGURAÇÃO ---

# Mapeamento de portas conhecidas para serviços
# Esta lista pode ser expandida com mais portas conforme necessário
SERVICE_MAP = {
    80: "HTTP", 443: "HTTPS", 21: "FTP", 22: "SSH", 25: "SMTP", 53: "DNS",
    123: "NTP", 143: "IMAP", 3306: "MySQL", 5432: "PostgreSQL",
}

# Caches
hostname_cache: Dict[str, str] = {}
vendor_cache: Dict[str, str] = {}
ip_to_mac_map: Dict[str, str] = {}
traffic_data: Dict[str, Any] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
data_lock = threading.Lock()

def get_vendor_from_mac(mac: str) -> str:
    if mac in vendor_cache: return vendor_cache[mac]
    try:
        response = requests.get(f"https://api.maclookup.app/v2/macs/{mac.replace(':', '')}", timeout=2)
        if response.status_code == 200:
            vendor = response.json().get("company", "Desconhecido")
            vendor_cache[mac] = vendor
            return vendor
    except requests.exceptions.RequestException: pass
    vendor_cache[mac] = "Desconhecido"
    return "Desconhecido"

def get_hostname(ip_address: str) -> str:
    if ip_address in hostname_cache: return hostname_cache[ip_address]
    try:
        hostname, _, _ = socket.gethostbyaddr(ip_address)
        hostname_cache[ip_address] = hostname
        return hostname
    except (socket.herror, socket.gaierror):
        hostname_cache[ip_address] = ip_address
        return ip_address

def get_service_name(pkt: Any) -> str:
    """Identifica o serviço com base na porta do pacote."""
    if TCP in pkt:
        port = pkt[TCP].dport if pkt[IP].dst == SERVER_IP else pkt[TCP].sport
        return SERVICE_MAP.get(port, f"TCP-{port}")
    if UDP in pkt:
        port = pkt[UDP].dport if pkt[IP].dst == SERVER_IP else pkt[UDP].sport
        return SERVICE_MAP.get(port, f"UDP-{port}")
    if ICMP in pkt:
        return "ICMP"
    return "Outros"

def process_packet(pkt: Any) -> None:
    if not pkt.haslayer(IP) or not pkt.haslayer(Ether): return

    src_ip: str = pkt[IP].src
    dst_ip: str = pkt[IP].dst
    
    if src_ip != SERVER_IP and dst_ip != SERVER_IP: return

    pkt_size: int = len(pkt)
    service: str = get_service_name(pkt)
    
    with data_lock:
        if dst_ip == SERVER_IP:
            client_ip, client_mac, direction = src_ip, pkt[Ether].src, 'in'
        else:
            client_ip, client_mac, direction = dst_ip, pkt[Ether].dst, 'out'
        
        ip_to_mac_map[client_ip] = client_mac
        # Agrega por serviço, não mais por protocolo genérico
        traffic_data[client_ip][service][direction] += pkt_size

def send_data_periodically() -> None:
    while True:
        time.sleep(TIME_WINDOW)
        with data_lock:
            if not traffic_data: continue
            data_copy = json.loads(json.dumps(traffic_data))
            ip_mac_copy = ip_to_mac_map.copy()
            traffic_data.clear()

        hosts, vendors = {}, {}
        for ip in data_copy.keys():
            hosts[ip] = get_hostname(ip)
            mac = ip_mac_copy.get(ip)
            vendors[ip] = get_vendor_from_mac(mac) if mac else "Desconhecido"

        payload = {"traffic": data_copy, "hosts": hosts, "vendors": vendors}
        try:
            headers = {'Content-type': 'application/json'}
            requests.post(API_ENDPOINT, data=json.dumps(payload), headers=headers, timeout=3)
            print(f"[{time.strftime('%H:%M:%S')}] Dados ao vivo enviados com sucesso.")
        except requests.exceptions.RequestException as e:
            print(f"[{time.strftime('%H:%M:%S')}] Erro ao enviar dados: {e}")

if __name__ == "__main__":
    print("Iniciando captura com mapeamento de serviços...")
    threading.Thread(target=send_data_periodically, daemon=True).start()
    sniff(prn=process_packet, store=False)