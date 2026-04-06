import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sla_snapshots (
      id INT PRIMARY KEY AUTO_INCREMENT,
      snapshotDate VARCHAR(10) NOT NULL,
      orderId INT NOT NULL,
      clientId INT NOT NULL,
      clientName VARCHAR(120) NOT NULL,
      poNum VARCHAR(80) DEFAULT '',
      refNum VARCHAR(80) DEFAULT '',
      creation VARCHAR(10) DEFAULT '',
      company VARCHAR(160) DEFAULT '',
      notes TEXT,
      facility VARCHAR(80) DEFAULT '',
      fullyAllocated BOOLEAN NOT NULL DEFAULT FALSE,
      rule VARCHAR(255) NOT NULL,
      slaDate VARCHAR(10),
      outOfSla BOOLEAN NOT NULL DEFAULT FALSE,
      alwaysFlag BOOLEAN NOT NULL DEFAULT FALSE,
      flagNote VARCHAR(255),
      bizDaysLate INT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      INDEX idx_sla_snapshot_date (snapshotDate),
      INDEX idx_sla_client (clientId),
      INDEX idx_sla_out_of_sla (outOfSla),
      INDEX idx_sla_order (orderId)
    )
  `);
  console.log("✅ sla_snapshots table created");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await conn.end();
}
