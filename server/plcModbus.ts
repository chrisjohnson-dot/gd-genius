/**
 * PLC Modbus TCP Interface
 *
 * Implements belt stop, tamp fire, and divert coil writes to the PLC
 * via Modbus TCP protocol (function code 0x05 — Write Single Coil).
 *
 * Coil addresses (configurable, defaults from the engineering spec):
 *   BELT_STOP_COIL   — 0x0001  (write TRUE to stop belt, FALSE to resume)
 *   TAMP_FIRE_COIL   — 0x0002  (write TRUE to trigger tamp applicator)
 *   DIVERT_COIL      — 0x0003  (write TRUE to divert carton to hold lane)
 *
 * When stubMode is true, all writes are logged but no TCP connection is made.
 * This allows the app to run in a test environment without physical hardware.
 */

export interface PlcConfig {
  ip: string;
  port: number; // default 502
  unitId: number; // default 1
  stubMode: boolean;
  beltStopCoil?: number;
  tampFireCoil?: number;
  divertCoil?: number;
}

export type CoilAction = "belt_stop" | "belt_resume" | "tamp_fire" | "divert_on" | "divert_off";

const DEFAULT_COILS = {
  beltStopCoil: 0x0001,
  tampFireCoil: 0x0002,
  divertCoil: 0x0003,
};

/**
 * Build a Modbus TCP Write Single Coil (FC05) request frame.
 */
function buildWriteSingleCoilFrame(
  transactionId: number,
  unitId: number,
  coilAddress: number,
  value: boolean
): Buffer {
  const buf = Buffer.alloc(12);
  // Modbus TCP header
  buf.writeUInt16BE(transactionId, 0); // Transaction ID
  buf.writeUInt16BE(0x0000, 2);        // Protocol ID (always 0)
  buf.writeUInt16BE(6, 4);             // Length (6 bytes follow)
  buf.writeUInt8(unitId, 6);           // Unit ID
  buf.writeUInt8(0x05, 7);             // Function code: Write Single Coil
  buf.writeUInt16BE(coilAddress, 8);   // Coil address
  buf.writeUInt16BE(value ? 0xFF00 : 0x0000, 10); // Value: 0xFF00=ON, 0x0000=OFF
  return buf;
}

/**
 * Send a single Modbus TCP Write Single Coil command.
 */
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
    const transactionId = Math.floor(Math.random() * 0xFFFF);
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
      resolve(); // Some PLCs close without sending a response frame
    });
  });
}

/**
 * Execute a PLC coil action. In stub mode, logs the action without connecting.
 */
export async function plcWrite(config: PlcConfig, action: CoilAction): Promise<{ stubbed: boolean }> {
  const coils = {
    beltStopCoil: config.beltStopCoil ?? DEFAULT_COILS.beltStopCoil,
    tampFireCoil: config.tampFireCoil ?? DEFAULT_COILS.tampFireCoil,
    divertCoil: config.divertCoil ?? DEFAULT_COILS.divertCoil,
  };

  let coilAddress: number;
  let value: boolean;

  switch (action) {
    case "belt_stop":
      coilAddress = coils.beltStopCoil;
      value = true;
      break;
    case "belt_resume":
      coilAddress = coils.beltStopCoil;
      value = false;
      break;
    case "tamp_fire":
      coilAddress = coils.tampFireCoil;
      value = true;
      break;
    case "divert_on":
      coilAddress = coils.divertCoil;
      value = true;
      break;
    case "divert_off":
      coilAddress = coils.divertCoil;
      value = false;
      break;
    default:
      throw new Error(`Unknown PLC action: ${action}`);
  }

  if (config.stubMode) {
    console.log(
      `[PLC STUB] ${action} → coil 0x${coilAddress.toString(16).padStart(4, "0")} = ${value} ` +
      `(target: ${config.ip}:${config.port}, unit: ${config.unitId})`
    );
    return { stubbed: true };
  }

  await sendModbusCoil(config.ip, config.port, config.unitId, coilAddress, value);
  return { stubbed: false };
}

/**
 * Stop the belt (emergency stop on fail/hold verdict).
 */
export async function plcBeltStop(config: PlcConfig): Promise<void> {
  await plcWrite(config, "belt_stop");
}

/**
 * Resume the belt after supervisor resolution.
 */
export async function plcBeltResume(config: PlcConfig): Promise<void> {
  await plcWrite(config, "belt_resume");
}

/**
 * Fire the tamp applicator (triggered immediately after a pass verdict).
 */
export async function plcTampFire(config: PlcConfig): Promise<void> {
  await plcWrite(config, "tamp_fire");
}

/**
 * Activate the divert solenoid (send carton to hold lane on hold verdict).
 */
export async function plcDivertOn(config: PlcConfig): Promise<void> {
  await plcWrite(config, "divert_on");
}

/**
 * Deactivate the divert solenoid.
 */
export async function plcDivertOff(config: PlcConfig): Promise<void> {
  await plcWrite(config, "divert_off");
}
