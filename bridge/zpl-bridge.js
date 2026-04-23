#!/usr/bin/env node
/**
 * GD Genius — ZPL Print Bridge
 * ─────────────────────────────
 * Runs on the warehouse Mac (or any machine on the same LAN as the Zebra printer).
 * Listens for WebSocket connections from the browser and forwards ZPL to the
 * Zebra printer via raw TCP (port 9100).
 *
 * Usage:
 *   node zpl-bridge.js [--printer-ip 10.90.1.218] [--printer-port 9100] [--ws-port 9101]
 *
 * Install as a background service:
 *   npm install -g pm2
 *   pm2 start zpl-bridge.js --name gd-zpl-bridge -- --printer-ip 10.90.1.218
 *   pm2 save && pm2 startup
 */

const net = require("net");
const http = require("http");
const { WebSocketServer } = require("ws");

// ── Config (override via CLI args) ──────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PRINTER_IP   = getArg("--printer-ip",   "10.90.1.218");
const PRINTER_PORT = parseInt(getArg("--printer-port", "9100"), 10);
const WS_PORT      = parseInt(getArg("--ws-port",      "9101"), 10);

// ── HTTP server (health check + CORS preflight) ──────────────────────────────
const httpServer = http.createServer((req, res) => {
  // Allow browser requests from any origin (needed for cross-origin WS upgrade)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      printerIp: PRINTER_IP,
      printerPort: PRINTER_PORT,
      wsPort: WS_PORT,
      version: "1.0.0",
    }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[bridge] Browser connected from ${clientIp}`);

  ws.on("message", (data) => {
    const zpl = data.toString("utf8");
    if (!zpl.trim()) {
      ws.send(JSON.stringify({ ok: false, error: "Empty ZPL payload" }));
      return;
    }

    console.log(`[bridge] Forwarding ${zpl.length} bytes to ${PRINTER_IP}:${PRINTER_PORT}`);

    // Open a fresh TCP connection for each print job (Zebra closes after job)
    const socket = new net.Socket();
    let responded = false;

    const respond = (ok, error) => {
      if (responded) return;
      responded = true;
      try {
        ws.send(JSON.stringify(ok ? { ok: true } : { ok: false, error }));
      } catch (_) { /* ws may have closed */ }
    };

    socket.setTimeout(8000);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      socket.write(zpl, "utf8", (err) => {
        if (err) {
          console.error(`[bridge] Write error: ${err.message}`);
          respond(false, `Write error: ${err.message}`);
          socket.destroy();
        } else {
          // Give the printer a moment to accept the data before closing
          setTimeout(() => {
            socket.end();
            respond(true);
            console.log("[bridge] Print job sent successfully");
          }, 300);
        }
      });
    });

    socket.on("timeout", () => {
      console.error(`[bridge] TCP timeout connecting to ${PRINTER_IP}:${PRINTER_PORT}`);
      respond(false, `Printer connection timed out (${PRINTER_IP}:${PRINTER_PORT}). Check that the printer is on and reachable.`);
      socket.destroy();
    });

    socket.on("error", (err) => {
      console.error(`[bridge] TCP error: ${err.message}`);
      respond(false, `Printer TCP error: ${err.message}`);
    });
  });

  ws.on("close", () => {
    console.log(`[bridge] Browser disconnected from ${clientIp}`);
  });

  ws.on("error", (err) => {
    console.error(`[bridge] WebSocket error: ${err.message}`);
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(WS_PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         GD Genius — ZPL Print Bridge v1.0.0          ║
╠══════════════════════════════════════════════════════╣
║  WebSocket:  ws://localhost:${WS_PORT}                    ║
║  Health:     http://localhost:${WS_PORT}/health            ║
║  Printer:    ${PRINTER_IP}:${PRINTER_PORT}              ║
╚══════════════════════════════════════════════════════╝

Bridge is running. Keep this terminal open, or run with pm2 for background mode.
`);
});

process.on("SIGINT", () => {
  console.log("\n[bridge] Shutting down...");
  wss.close();
  httpServer.close();
  process.exit(0);
});
