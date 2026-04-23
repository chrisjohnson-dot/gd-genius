# GD Genius — ZPL Print Bridge

This tiny local agent runs on the **warehouse Mac** and bridges the browser to the Zebra ZT610 printer. The cloud server cannot reach your local printer (private LAN IP), so this bridge runs locally and the browser connects to it directly.

## How it works

```
Browser (warehouse Mac)
    │
    │  WebSocket  ws://localhost:9101
    ▼
ZPL Bridge (this script, running on warehouse Mac)
    │
    │  Raw TCP  10.90.1.218:9100
    ▼
Zebra ZT610 Printer
```

## Quick Start

### 1. Install Node.js (if not already installed)
```bash
# Check if Node.js is installed
node --version

# If not installed, download from https://nodejs.org (LTS version)
```

### 2. Download and install the bridge
```bash
# Copy the bridge folder to your Mac, then:
cd /path/to/bridge
npm install
```

### 3. Run the bridge
```bash
node zpl-bridge.js --printer-ip 10.90.1.218 --printer-port 9100 --ws-port 9101
```

You should see:
```
╔══════════════════════════════════════════════════════╗
║         GD Genius — ZPL Print Bridge v1.0.0          ║
╠══════════════════════════════════════════════════════╣
║  WebSocket:  ws://localhost:9101                      ║
║  Health:     http://localhost:9101/health             ║
║  Printer:    10.90.1.218:9100                         ║
╚══════════════════════════════════════════════════════╝
```

### 4. Verify it's running
Open a browser and go to: http://localhost:9101/health

You should see: `{"status":"ok","printerIp":"10.90.1.218",...}`

## Run as a background service (recommended for production)

Install pm2 to keep the bridge running even after closing the terminal:

```bash
npm install -g pm2
pm2 start zpl-bridge.js --name gd-zpl-bridge -- --printer-ip 10.90.1.218 --printer-port 9100 --ws-port 9101
pm2 save
pm2 startup   # follow the printed instructions to auto-start on login
```

To check status: `pm2 status`  
To view logs: `pm2 logs gd-zpl-bridge`  
To stop: `pm2 stop gd-zpl-bridge`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Bridge not reachable" in Genius | Bridge not running | Start the bridge script |
| "Printer TCP error: ECONNREFUSED" | Printer off or wrong IP | Check printer power and IP |
| "Printer connection timed out" | Firewall blocking port 9100 | Check network/firewall settings |
| Bridge starts but Genius can't connect | Wrong WS port in Genius settings | Check Printer Settings in Genius |
