/**
 * PLC Modbus TCP interface — AutomationDirect Click! PLC
 * v3 spec: 10 coils + DS1/DS2/DS10 data registers
 *
 * Coil map (0-based addresses, configurable):
 *   App → PLC (write)
 *     C1  (addr 0)  DIVERT          — fire divert solenoid (auto-reset by PLC)
 *     C2  (addr 1)  BELT_STOP       — stop belt
 *     C3  (addr 2)  TAMP_FIRE       — fire tamp
 *     C4  (addr 3)  STOP_PLATE      — raise/drop stop plate
 *     C5  (addr 4)  SQUARE_EXTEND   — extend squaring cylinder
 *     C6  (addr 5)  SQUARE_RETRACT  — retract squaring cylinder
 *   PLC → App (read)
 *     C10 (addr 9)  TAMP_READY
 *     C11 (addr 10) BELT_RUNNING
 *     C12 (addr 11) SQUARE_CONFIRMED
 *     C13 (addr 12) SQUARE_HOME
 *
 * Data register map (holding registers, 0-based):
 *   DS1  (addr 0)  TAMP_X  — fixed constant (tenths of mm)
 *   DS2  (addr 1)  TAMP_Y  — dynamic per carton (tenths of mm)
 *   DS10 (addr 9)  ENCODER_POS — read-only
 *
 * EtherNet/IP (Allen-Bradley) is handled by plcEnip.ts.
 */

import net from "net";
import { enipWrite, type EnipConfig } from "./plcEnip";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoilAction = "belt_stop" | "belt_resume" | "tamp_fire" | "divert_on" | "divert_off";

export interface PlcConfig {
  protocol?: "modbus" | "enip";
  ip: string;
  port: number;
  unitId: number;
  stubMode: boolean;
  // v3 Modbus coil addresses
  coilDivert: number;
  coilBeltStop: number;
  coilTampFire: number;
  coilStopPlate: number;
  coilSquareExtend: number;
  coilSquareRetract: number;
  coilTampReady: number;
  coilBeltRunning: number;
  coilSquareConfirmed: number;
  coilSquareHome: number;
  // v3 Data register addresses
  regTampX: number;
  regTampY: number;
  regEncoderPos: number;
  // Timeouts
  squaringTimeoutMs: number;
  tampReadyTimeoutMs: number;
  // EtherNet/IP fields (optional)
  enipSlot?: number;
  enipTagBeltStop?: string;
  enipTagTampFire?: string;
  enipTagDivertOn?: string;
}

/** Build a PlcConfig from the labelScanSettings DB row */
export function buildPlcConfig(s: {
  plcProtocol: string;
  plcIp: string;
  plcPort: number;
  plcUnitId: number;
  plcStubMode: boolean;
  modbusCoilDivert: number;
  modbusCoilBeltStop: number;
  modbusCoilTampFire: number;
  modbusCoilStopPlate: number;
  modbusCoilSquareExtend: number;
  modbusCoilSquareRetract: number;
  modbusCoilTampReady: number;
  modbusCoilBeltRunning: number;
  modbusCoilSquareConfirmed: number;
  modbusCoilSquareHome: number;
  modbusRegTampX: number;
  modbusRegTampY: number;
  modbusRegEncoderPos: number;
  squaringTimeoutMs: number;
  tampReadyTimeoutMs: number;
  enipSlot?: number | null;
  enipTagBeltStop?: string | null;
  enipTagTampFire?: string | null;
  enipTagDivertOn?: string | null;
}): PlcConfig {
  return {
    protocol: (s.plcProtocol as "modbus" | "enip") ?? "modbus",
    ip: s.plcIp,
    port: s.plcPort,
    unitId: s.plcUnitId,
    stubMode: s.plcStubMode,
    coilDivert: s.modbusCoilDivert,
    coilBeltStop: s.modbusCoilBeltStop,
    coilTampFire: s.modbusCoilTampFire,
    coilStopPlate: s.modbusCoilStopPlate,
    coilSquareExtend: s.modbusCoilSquareExtend,
    coilSquareRetract: s.modbusCoilSquareRetract,
    coilTampReady: s.modbusCoilTampReady,
    coilBeltRunning: s.modbusCoilBeltRunning,
    coilSquareConfirmed: s.modbusCoilSquareConfirmed,
    coilSquareHome: s.modbusCoilSquareHome,
    regTampX: s.modbusRegTampX,
    regTampY: s.modbusRegTampY,
    regEncoderPos: s.modbusRegEncoderPos,
    squaringTimeoutMs: s.squaringTimeoutMs,
    tampReadyTimeoutMs: s.tampReadyTimeoutMs,
    enipSlot: s.enipSlot ?? 0,
    enipTagBeltStop: s.enipTagBeltStop ?? "GD_BeltStop",
    enipTagTampFire: s.enipTagTampFire ?? "GD_TampFire",
    enipTagDivertOn: s.enipTagDivertOn ?? "GD_DivertOn",
  };
}

// ─── Modbus TCP frame builders ────────────────────────────────────────────────

let _txId = 0;
function nextTxId() { _txId = (_txId + 1) & 0xffff; return _txId; }

function buildWriteCoilFrame(unitId: number, coilAddr: number, value: boolean): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(nextTxId(), 0);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt16BE(6, 4);
  buf.writeUInt8(unitId, 6);
  buf.writeUInt8(0x05, 7);
  buf.writeUInt16BE(coilAddr, 8);
  buf.writeUInt16BE(value ? 0xff00 : 0x0000, 10);
  return buf;
}

function buildWriteRegisterFrame(unitId: number, regAddr: number, value: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(nextTxId(), 0);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt16BE(6, 4);
  buf.writeUInt8(unitId, 6);
  buf.writeUInt8(0x06, 7);
  buf.writeUInt16BE(regAddr, 8);
  buf.writeUInt16BE(value & 0xffff, 10);
  return buf;
}

function buildReadCoilsFrame(unitId: number, startAddr: number, count: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(nextTxId(), 0);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt16BE(6, 4);
  buf.writeUInt8(unitId, 6);
  buf.writeUInt8(0x01, 7);
  buf.writeUInt16BE(startAddr, 8);
  buf.writeUInt16BE(count, 10);
  return buf;
}

// ─── Persistent connection with auto-reconnect + auto belt-stop ───────────────

interface LiveConn {
  socket: net.Socket;
  connected: boolean;
  beltStopOnReconnect: boolean; // flag to assert belt stop after reconnect
}

const _pool = new Map<string, LiveConn>();

function poolKey(cfg: PlcConfig) { return `${cfg.ip}:${cfg.port}`; }

function createLiveConn(cfg: PlcConfig): LiveConn {
  const conn: LiveConn = { socket: new net.Socket(), connected: false, beltStopOnReconnect: false };

  function attach(socket: net.Socket) {
    socket.on("connect", () => {
      conn.connected = true;
      if (conn.beltStopOnReconnect) {
        // Assert belt stop immediately after reconnect for safety
        const frame = buildWriteCoilFrame(cfg.unitId, cfg.coilBeltStop, true);
        socket.write(frame);
        conn.beltStopOnReconnect = false;
      }
    });
    socket.on("error", () => { conn.connected = false; });
    socket.on("close", () => {
      conn.connected = false;
      conn.beltStopOnReconnect = true; // will assert belt stop on next connect
      setTimeout(() => {
        const s = new net.Socket();
        conn.socket = s;
        attach(s);
        s.connect(cfg.port, cfg.ip);
      }, 2000);
    });
  }

  attach(conn.socket);
  conn.socket.connect(cfg.port, cfg.ip);
  return conn;
}

function getLiveConn(cfg: PlcConfig): LiveConn {
  const key = poolKey(cfg);
  if (!_pool.has(key)) _pool.set(key, createLiveConn(cfg));
  return _pool.get(key)!;
}

function sendFrame(socket: net.Socket, frame: Buffer, timeoutMs = 300): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeAllListeners("data");
      reject(new Error("Modbus response timeout"));
    }, timeoutMs);
    socket.once("data", (data) => { clearTimeout(timer); resolve(data); });
    socket.write(frame, (err) => { if (err) { clearTimeout(timer); reject(err); } });
  });
}

// ─── Low-level Modbus operations ──────────────────────────────────────────────

async function modbusWriteCoil(cfg: PlcConfig, coilAddr: number, value: boolean): Promise<void> {
  if (cfg.stubMode) { console.log(`[PLC STUB] writeCoil addr=${coilAddr} val=${value}`); return; }
  const conn = getLiveConn(cfg);
  if (!conn.connected) throw new Error(`PLC not connected (${cfg.ip}:${cfg.port})`);
  await sendFrame(conn.socket, buildWriteCoilFrame(cfg.unitId, coilAddr, value));
}

async function modbusWriteRegister(cfg: PlcConfig, regAddr: number, value: number): Promise<void> {
  if (cfg.stubMode) { console.log(`[PLC STUB] writeReg addr=${regAddr} val=${value}`); return; }
  const conn = getLiveConn(cfg);
  if (!conn.connected) throw new Error(`PLC not connected (${cfg.ip}:${cfg.port})`);
  await sendFrame(conn.socket, buildWriteRegisterFrame(cfg.unitId, regAddr, value));
}

async function modbusReadCoil(cfg: PlcConfig, coilAddr: number): Promise<boolean> {
  if (cfg.stubMode) { console.log(`[PLC STUB] readCoil addr=${coilAddr} → true`); return true; }
  const conn = getLiveConn(cfg);
  if (!conn.connected) throw new Error(`PLC not connected (${cfg.ip}:${cfg.port})`);
  const resp = await sendFrame(conn.socket, buildReadCoilsFrame(cfg.unitId, coilAddr, 1));
  if (resp.length < 10) throw new Error("Modbus FC01 response too short");
  return (resp[9] & 0x01) === 1;
}

async function waitForCoil(cfg: PlcConfig, coilAddr: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await modbusReadCoil(cfg, coilAddr)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

// ─── High-level actions ───────────────────────────────────────────────────────

export async function plcBeltStop(cfg: PlcConfig): Promise<void> {
  await modbusWriteCoil(cfg, cfg.coilBeltStop, true);
}

export async function plcBeltResume(cfg: PlcConfig): Promise<void> {
  await modbusWriteCoil(cfg, cfg.coilBeltStop, false);
}

export async function plcDivertOn(cfg: PlcConfig): Promise<void> {
  await modbusWriteCoil(cfg, cfg.coilDivert, true);
}

export async function plcDivertOff(cfg: PlcConfig): Promise<void> {
  await modbusWriteCoil(cfg, cfg.coilDivert, false);
}

export async function plcTampFire(cfg: PlcConfig): Promise<void> {
  await modbusWriteCoil(cfg, cfg.coilTampFire, true);
}

/**
 * Full squaring + tamp sequence with overlap optimization (v3 spec §9.5):
 *
 * 1. Raise stop plate (C4=1)
 * 2. Extend squaring cylinder (C5=1)
 * 3. OVERLAP: while squaring cylinder is extending, write tamp_x and tamp_y
 *    to DS1/DS2 — saves ~150ms vs waiting for SQUARE_CONFIRMED first
 * 4. Wait for SQUARE_CONFIRMED (C12=1)
 * 5. Wait for TAMP_READY (C10=1)
 * 6. Fire tamp (C3=1)
 * 7. Retract squaring cylinder (C6=1)
 * 8. Drop stop plate (C4=0)
 */
export async function squareAndTamp(
  cfg: PlcConfig,
  tampXMm: number,
  tampYMm: number
): Promise<{ success: boolean; failStep?: string }> {
  try {
    // 1. Raise stop plate
    await modbusWriteCoil(cfg, cfg.coilStopPlate, true);

    // 2. Extend squaring cylinder
    await modbusWriteCoil(cfg, cfg.coilSquareExtend, true);

    // 3. OVERLAP: write tamp coordinates while squaring cylinder extends
    const tampXTenths = Math.round(tampXMm * 10);
    const tampYTenths = Math.round(tampYMm * 10);
    await modbusWriteRegister(cfg, cfg.regTampX, tampXTenths);
    await modbusWriteRegister(cfg, cfg.regTampY, tampYTenths);

    // 4. Wait for SQUARE_CONFIRMED (C12)
    const squared = await waitForCoil(cfg, cfg.coilSquareConfirmed, cfg.squaringTimeoutMs);
    if (!squared) {
      await modbusWriteCoil(cfg, cfg.coilSquareRetract, true);
      await modbusWriteCoil(cfg, cfg.coilStopPlate, false);
      return { success: false, failStep: "SQUARE_CONFIRMED_TIMEOUT" };
    }

    // 5. Wait for TAMP_READY (C10)
    const tampReady = await waitForCoil(cfg, cfg.coilTampReady, cfg.tampReadyTimeoutMs);
    if (!tampReady) {
      await modbusWriteCoil(cfg, cfg.coilSquareRetract, true);
      await modbusWriteCoil(cfg, cfg.coilStopPlate, false);
      return { success: false, failStep: "TAMP_READY_TIMEOUT" };
    }

    // 6. Fire tamp
    await modbusWriteCoil(cfg, cfg.coilTampFire, true);

    // 7. Retract squaring cylinder
    await modbusWriteCoil(cfg, cfg.coilSquareRetract, true);

    // 8. Drop stop plate
    await modbusWriteCoil(cfg, cfg.coilStopPlate, false);

    return { success: true };
  } catch (err) {
    // On any Modbus error, assert belt stop for safety
    try { await plcBeltStop(cfg); } catch { /* best effort */ }
    return { success: false, failStep: `MODBUS_ERROR: ${(err as Error).message}` };
  }
}

// ─── Legacy CoilAction dispatcher (used by scanEndpoint) ─────────────────────

export async function plcWrite(
  config: PlcConfig,
  action: CoilAction
): Promise<{ stubbed: boolean }> {
  if (config.protocol === "enip") {
    const enipConfig: EnipConfig = {
      ip: config.ip,
      port: config.port || 44818,
      slot: config.enipSlot ?? 0,
      stubMode: config.stubMode,
    };
    const tags = {
      belt_stop: config.enipTagBeltStop ?? "GD_BeltStop",
      tamp_fire: config.enipTagTampFire ?? "GD_TampFire",
      divert_on: config.enipTagDivertOn ?? "GD_DivertOn",
    };
    const result = await enipWrite(enipConfig, action, tags);
    return { stubbed: result.stubbed };
  }

  // Modbus path
  switch (action) {
    case "belt_stop":   await plcBeltStop(config); break;
    case "belt_resume": await plcBeltResume(config); break;
    case "tamp_fire":   await plcTampFire(config); break;
    case "divert_on":   await plcDivertOn(config); break;
    case "divert_off":  await plcDivertOff(config); break;
    default: throw new Error(`Unknown PLC action: ${action}`);
  }
  return { stubbed: config.stubMode };
}
