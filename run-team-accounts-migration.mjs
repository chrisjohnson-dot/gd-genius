import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const sql = `
CREATE TABLE IF NOT EXISTS \`team_accounts\` (
  \`id\` int AUTO_INCREMENT PRIMARY KEY,
  \`username\` varchar(128) NOT NULL,
  \`passwordHash\` varchar(256) NOT NULL,
  \`name\` varchar(256) NOT NULL,
  \`role\` varchar(64) NOT NULL DEFAULT 'qc_operator',
  \`active\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`team_accounts_username_unique\` (\`username\`)
);
`;

const conn = await createConnection(url);
await conn.execute(sql);
console.log("team_accounts table created (or already exists).");
await conn.end();
