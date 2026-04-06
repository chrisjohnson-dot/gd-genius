import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

await conn.execute(`
CREATE TABLE IF NOT EXISTS \`sla_order_actions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`extensivOrderId\` int NOT NULL,
  \`referenceNum\` varchar(256),
  \`clientId\` int NOT NULL,
  \`clientName\` varchar(256) NOT NULL,
  \`facilityId\` int NOT NULL,
  \`facilityName\` varchar(256),
  \`action\` enum('remove','waive') NOT NULL,
  \`reason\` text NOT NULL,
  \`performedByUserId\` varchar(128) NOT NULL,
  \`performedByName\` varchar(256),
  \`performedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`sla_order_actions_id\` PRIMARY KEY(\`id\`)
)
`);

console.log("✓ sla_order_actions table created (or already exists)");
await conn.end();
