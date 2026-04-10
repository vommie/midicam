#!/usr/bin/env python3
"""
MidiCam Starter Script für Linux
Startet automatisch:
- WebSocket Signaling Server (Port 8080)
- HTTP Server für den Client (Port 8081)

Ausführung: python3 start_midicam.py
"""

import os
import subprocess
import sys
import time
import signal

def main():
    # Projekt-Root ermitteln
    root_dir = os.path.dirname(os.path.abspath(__file__))
    server_dir = os.path.join(root_dir, "server")
    client_dir = os.path.join(root_dir, "client")

    if not os.path.isdir(server_dir) or not os.path.isdir(client_dir):
        print("❌ Fehler: Die Ordner 'client/' oder 'server/' wurden nicht gefunden!")
        print("   Stelle sicher, dass du das Skript im Root des Projekts ausführst.")
        sys.exit(1)

    print("🚀 MidiCam Starter wird gestartet...\n")

    # === 1. Node.js Dependencies installieren (falls noch nicht vorhanden) ===
    node_modules = os.path.join(server_dir, "node_modules")
    if not os.path.isdir(node_modules):
        print("📦 Installiere Server-Abhängigkeiten (npm install)...")
        try:
            subprocess.check_call(["npm", "install"], cwd=server_dir, stdout=subprocess.DEVNULL)
            print("✅ Abhängigkeiten erfolgreich installiert.\n")
        except subprocess.CalledProcessError:
            print("❌ npm install ist fehlgeschlagen. Ist Node.js installiert?")
            sys.exit(1)

    # === 2. WebSocket Signaling Server starten ===
    print("📡 Starte WebSocket Signaling Server (ws://localhost:8080)...")
    ws_process = subprocess.Popen(
        ["node", "server.js"],
        cwd=server_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    time.sleep(1)  # kurze Wartezeit damit der Server hochkommt

    # === 3. Client HTTP Server starten ===
    print("🌐 Starte Client HTTP Server[](http://localhost:8081)...")
    http_process = subprocess.Popen(
        ["python3", "-m", "http.server", "8081"],
        cwd=client_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    time.sleep(1)

    # === 4. Erfolgsmeldung + Anleitung ===
    print("\n" + "="*60)
    print("🎉 MIDI CAM ERFOLGREICH GESTARTET!")
    print("="*60)
    print("✅ WebSocket Server  →  ws://localhost:8080")
    print("✅ Client Weboberfläche →  http://localhost:8081")
    print("\n📋 So verbindest du dich:")
    print("   1. Öffne ZWEI Browser-Tabs/Fenster")
    print("   2. Gehe in beiden zu: http://localhost:8081")
    print("   3. Klicke in beiden Tabs auf den grünen 'Start'-Button")
    print("   4. Fertig! Du siehst das Video des anderen + Piano + MIDI")
    print("\n⏹️  Zum Beenden einfach Ctrl + C drücken\n")

    # === 5. Logs der beiden Server in Echtzeit ausgeben ===
    try:
        while True:
            # WebSocket Server Logs
            ws_line = ws_process.stdout.readline()
            if ws_line:
                print(f"[WS] {ws_line.strip()}")

            # HTTP Server Logs
            http_line = http_process.stdout.readline()
            if http_line:
                print(f"[HTTP] {http_line.strip()}")

            # Falls ein Server abstürzt, abbrechen
            if ws_process.poll() is not None:
                print("⚠️  WebSocket Server ist abgestürzt!")
                break
            if http_process.poll() is not None:
                print("⚠️  HTTP Server ist abgestürzt!")
                break

            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\n\n🛑 Ctrl+C empfangen – beende alle Server...")
    finally:
        # Beide Prozesse sauber beenden
        if ws_process.poll() is None:
            ws_process.terminate()
            try:
                ws_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                ws_process.kill()
        if http_process.poll() is None:
            http_process.terminate()
            try:
                http_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                http_process.kill()

        print("✅ Alle Server wurden gestoppt. Tschüss! 👋")

if __name__ == "__main__":
    # Signal-Handling für sauberes Beenden
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    main()
