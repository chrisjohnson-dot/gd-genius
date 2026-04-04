/**
 * PLC Interface — Modbus TCP and EtherNet/IP (Allen-Bradley) dispatcher
 *
 * Implements belt stop, tamp fire, and divert coil/tag writes to the PLC.
 *
 * Protocol selection:
 *   - "modbus" (default): Modbus TCP, Function Code 0x05 Write Single Coil
 *   - "enip": EtherNet/IP CIP Write Tag Service for Allen-Bradley ControlLogix/CompactLogix
 *
 * Stub mode: when stubMode is true, all writes are logged but no TCP connection is made.
 */

import { enipWrite, type EnipConfig } from "./plcEnip";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type CoilAction = "belt_stop" | "belt_resume" | "tamp_fire" | "divert_on" | "divert_off";

// ─── Modbus TCP config ────────────────────────────────────────────────────────

export interface PlcConfig {
  protocol?: "modbus" | "enip";
  ip: string;
  port: number;       // Modbus: 502 | EtherNet/IP: 44818
  unitId: number;     // Modbus unit ID (1 default); ignored for EtherNet/IP
  stubMode: boolean;
  // Modbus coil addresses
  beltStopCoil?: number;
  tampFireCoil?: number;
  divertCoil?: number;
  // EtherNet/IP tag names (Allen-Bradley)
  enipSlot?: number;
  enipTagBeltStop?: string;
  enipTagTampFire?: string;
  enipTagDivertOn?: string;
}

const DEFAULT_COILS = {
  beltStopCoil: 0x0001,
  tampFireCoil: 0x0002,
  divertCoil: 0x0003,
};

const DEFAULT_TAGS = {
  belt_stop: "GD_BeltStop",
  tamp_fire: "GD_TampFire",
  divert_on: "GD_DivertOn",
};

// ─── Modbus TCP implementation ────────────────────────────────────────────────

function buildWriteSingleCoilFrame(
  transactionId: number,
  unitId: number,
  coilAddress: number,
  value: boolean
): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(transactionId, 0);
  buf.writeUInt16BE(0x0000, 2);
  buf.writeUInt16BE(6, 4);
  buf.writeUInt8(unitId, 6);
  buf.writeUInt8(0x05, 7);
  buf.writeUInt16BE(coilAddress, 8);
  buf.writeUInt16BE(value ? 0xff00 : 0x0000, 10);
  return buf;
}

async function sendModbusCoil(
  ip: string,
  port: number,
  unitId: number,
  coilAddress: number,
  value: boolean,
  timeoutMs = 3000
): Promise<void> {
  const { createConnection } = await import("net");
  await new Promise<void>((resolve, reject) => {
    const transactionId = Math.floor(Math.random() * 0xffff);
    const frame = buildWriteSingleCoilFrame(transactionId, unitId, coilAddress, value);
    const socket = createConnection({ host: ip, port }, () => {
      socket.write(frame);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Modbus TCP timeout after ${timeoutMs}ms connecting to ${ip}:${port}`));
    }, timeoutMs);
    socket.on("data", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function plcWriteModbus(config: PlcConfig, action: CoilAction): Promise<{ stubbed: boolean }> {
  const coils = {
    beltStopCoil: config.beltStopCoil ?? DEFAULT_COILS.beltStopCoil,
    tampFireCoil: config.tampFireCoil ?? DEFAULT_COILS.tampFireCoil,
    divertCoil: config.divertCoil ?? DEFAULT_COILS.divertCoil,
  };

  let coilAddress: number;
  let value: boolean;

  switch (action) {
    case "belt_stop":   coilAddress = coils.beltStopCoil; value = true;  break;
    case "belt_resume": coilAddress = coils.beltStopCoil; value = false; break;
    case "tamp_fire":   coilAddress = coils.tampFireCoil; value = true;  break;
    case "divert_on":   coilAddress = coils.divertCoil;  value = true;  break;
    case "divert_off":  coilAddress = coils.divertCoil;  value = false; break;
    default: throw new Error(`Unknown PLC action: ${action}`);
  }

  if (config.stubMode) {
    console.log(
      `[PLC MODBUS STUB] ${action} → coil 0x${coilAddress.toString(16).padStart(4, "0")} = ${value} ` +
      `(${config.ip}:${config.port}, unit: ${config.unitId})`
    );
    return { stubbed: true };
  }

  await sendModbusCoil(config.ip, config.port, config.unitId, coilAddress, value);
  return { stubbed: false };
}

// ─── EtherNet/IP implementation ───────────────────────────────────────────────

async function plcWriteEnip(config: PlcConfig, action: CoilAction): Promise<{ stubbed: boolean }> {
  const enipConfig: EnipConfig = {
    ip: config.ip,
    port: config.port || 44818,
    slot: config.enipSlot ?? 0,
    stubMode: config.stubMode,
  };

  const tags = {
    belt_stop: config.enipTagBeltStop ?? DEFAULT_TAGS.belt_stop,
    tamp_fire: config.enipTagTampFire ?? DEFAULT_TAGS.tamp_fire,
    divert_on: config.enipTagDivertOn ?? DEFAULT_TAGS.divert_on,
  };

  const result = await enipWrite(enipConfig, action, tags);
  return { stubbed: result.stubbed };
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/**
 * Execute a PLC action using the configured protocol (Modbus TCP or EtherNet/IP).
 * In stub mode, logs the action without making any network connection.
 */
export async function plcWrite(config: PlcConfig, action: CoilAction): Promise<{ stubbed: boolean }> {
  const protocol = config.protocol ?? "modbus";
  if (protocol === "enip") {
    return plcWriteEnip(config, action);
  }
  return plcWriteModbus(config, action);
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export async function plcBeltStop(config: PlcConfig): Promise<void> {
  await plcWrite(config, "belt_stop");
}

export async function plcBeltResume(config: PlcConfig): Promise<void> {
  await plcWrite(config, "belt_resume");
}

export async function plcTampFire(config: PlcConfig): Promise<void> {
  await plcWrite(config, "tamp_fire");
}

export async function plcDivertOn(config: PlcConfig): Promise<void> {
  await plcWrite(config, "divert_on");
}

export async function plcDivertOff(config: PlcConfig): Promise<void> {
  await plcWrite(config, "divert_off");
}
