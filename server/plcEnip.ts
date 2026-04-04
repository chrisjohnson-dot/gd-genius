/**
 * EtherNet/IP (CIP) interface for Allen-Bradley PLC tag writes.
 *
 * Allen-Bradley ControlLogix / CompactLogix PLCs use EtherNet/IP (port 44818)
 * as their native protocol. Tags are addressed by name (e.g. "GD_BeltStop")
 * rather than by coil/register number as in Modbus.
 *
 * This module implements a minimal CIP Unconnected Message Manager (UCMM)
 * Write Tag Service request over TCP to set a BOOL tag to TRUE (1) or FALSE (0).
 *
 * Protocol reference:
 *   - EtherNet/IP Specification: ODVA Publication PUB00138
 *   - CIP Vol 1: Common Industrial Protocol
 *   - Allen-Bradley Logix5000 Data Access Manual (1756-PM020)
 *
 * Stub mode: when stubMode is true, all writes are logged but no TCP connection
 * is made — safe for development and commissioning dry-runs.
 */

export interface EnipConfig {
  ip: string;
  port?: number;       // default 44818 (EtherNet/IP standard)
  slot?: number;       // backplane slot of the Logix controller (default 0)
  stubMode?: boolean;
}

export type PlcAction = "belt_stop" | "tamp_fire" | "divert_on" | "belt_resume" | "divert_off";

export interface EnipWriteResult {
  stubbed: boolean;
  action: PlcAction;
  tagName: string;
  value: number;
  durationMs?: number;
}

/**
 * Build a CIP Write Tag Service request packet for a BOOL tag.
 *
 * Packet structure (UCMM over TCP):
 *   EtherNet/IP Encapsulation Header (24 bytes)
 *   └─ Command: SendRRData (0x0065)
 *   CPF (Common Packet Format)
 *   └─ Item 1: Null Address (0x0000)
 *   └─ Item 2: Unconnected Data (0x00B2)
 *       └─ CIP Request
 *           └─ Service: Write Tag (0x4D)
 *           └─ Request Path: ANSI Extended Symbolic Segment for tag name
 *           └─ Data Type: BOOL (0xC1), count 1, value 0x01 or 0x00
 */
function buildWriteTagPacket(tagName: string, value: 0 | 1, slot: number): Buffer {
  // ── CIP Request Path ──────────────────────────────────────────────────────
  // ANSI Extended Symbolic Segment: 0x91, length, tag name bytes (padded to even)
  const tagBytes = Buffer.from(tagName, "ascii");
  const tagLen = tagBytes.length;
  const tagPadded = tagLen % 2 === 0 ? tagBytes : Buffer.concat([tagBytes, Buffer.from([0x00])]);
  const requestPath = Buffer.concat([
    Buffer.from([0x91, tagLen]),
    tagPadded,
  ]);
  const pathWordSize = Math.ceil(requestPath.length / 2);

  // ── CIP Write Tag Request ─────────────────────────────────────────────────
  // Service 0x4D, path size (words), path, data type BOOL (0xC1), count 1, value
  const cipRequest = Buffer.concat([
    Buffer.from([0x4d, pathWordSize]),
    requestPath,
    Buffer.from([0xc1, 0x00, 0x01, 0x00, value, 0x00]), // type BOOL, count 1, value, pad
  ]);

  // ── CPF (Common Packet Format) ────────────────────────────────────────────
  // Item count: 2
  // Item 1: Null Address (type 0x0000, length 0)
  // Item 2: Unconnected Data (type 0x00B2, length = cipRequest.length)
  const cpf = Buffer.concat([
    Buffer.from([0x02, 0x00]),                              // item count
    Buffer.from([0x00, 0x00, 0x00, 0x00]),                  // null address item
    Buffer.from([0xb2, 0x00]),                              // unconnected data type
    Buffer.from([cipRequest.length & 0xff, (cipRequest.length >> 8) & 0xff]),
    cipRequest,
  ]);

  // ── EtherNet/IP Encapsulation ─────────────────────────────────────────────
  // SendRRData command (0x0065), length = cpf.length + 8 (interface handle + timeout)
  const encapDataLen = cpf.length + 8;
  const encap = Buffer.alloc(24 + encapDataLen);
  encap.writeUInt16LE(0x0065, 0);                           // command: SendRRData
  encap.writeUInt16LE(encapDataLen, 2);                     // length
  encap.writeUInt32LE(0, 4);                                // session handle (0 = no session)
  encap.writeUInt32LE(0, 8);                                // status
  encap.writeUInt32LE(0, 12);                               // sender context (low)
  encap.writeUInt32LE(0, 16);                               // sender context (high)
  encap.writeUInt32LE(0, 20);                               // options
  // Interface handle (0 = CIP) + timeout (0 = no timeout)
  encap.writeUInt32LE(0, 24);
  encap.writeUInt16LE(0, 28);
  cpf.copy(encap, 30);

  return encap;
}

/**
 * Send a single CIP Write Tag request over a raw TCP socket to an Allen-Bradley PLC.
 * Opens a connection, sends the packet, reads the response, then closes.
 */
async function sendEnipWrite(
  config: EnipConfig,
  tagName: string,
  value: 0 | 1
): Promise<void> {
  const { ip, port = 44818, slot = 0 } = config;
  const packet = buildWriteTagPacket(tagName, value, slot);

  return new Promise((resolve, reject) => {
    const net = require("net") as typeof import("net");
    const socket = new net.Socket();
    const timeout = 3000;

    socket.setTimeout(timeout);
    socket.connect(port, ip, () => {
      socket.write(packet);
    });

    let responseBuffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      // Minimum EtherNet/IP response is 24 bytes header
      if (responseBuffer.length >= 24) {
        const status = responseBuffer.readUInt32LE(8);
        socket.destroy();
        if (status === 0) {
          resolve();
        } else {
          reject(new Error(`EtherNet/IP error status 0x${status.toString(16)} writing tag "${tagName}"`));
        }
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`EtherNet/IP connection to ${ip}:${port} timed out writing tag "${tagName}"`));
    });

    socket.on("error", (err: Error) => {
      reject(new Error(`EtherNet/IP socket error writing tag "${tagName}": ${err.message}`));
    });
  });
}

/**
 * Write a PLC action tag via EtherNet/IP.
 *
 * @param config  EtherNet/IP connection config
 * @param action  Logical PLC action name
 * @param tags    Tag name mapping for each action
 */
export async function enipWrite(
  config: EnipConfig,
  action: PlcAction,
  tags: {
    belt_stop: string;
    tamp_fire: string;
    divert_on: string;
  }
): Promise<EnipWriteResult> {
  // Map action to tag name and value
  const actionMap: Record<PlcAction, { tag: string; value: 0 | 1 }> = {
    belt_stop:    { tag: tags.belt_stop,  value: 1 },
    belt_resume:  { tag: tags.belt_stop,  value: 0 },  // clear belt stop
    tamp_fire:    { tag: tags.tamp_fire,  value: 1 },
    divert_on:    { tag: tags.divert_on,  value: 1 },
    divert_off:   { tag: tags.divert_on,  value: 0 },
  };

  const mapped = actionMap[action];
  if (!mapped) {
    throw new Error(`Unknown PLC action: ${action}`);
  }

  if (config.stubMode) {
    console.log(`[PLC ENIP STUB] ${action} → tag "${mapped.tag}" = ${mapped.value} @ ${config.ip}:${config.port ?? 44818}`);
    return { stubbed: true, action, tagName: mapped.tag, value: mapped.value };
  }

  const start = Date.now();
  await sendEnipWrite(config, mapped.tag, mapped.value);
  return {
    stubbed: false,
    action,
    tagName: mapped.tag,
    value: mapped.value,
    durationMs: Date.now() - start,
  };
}
