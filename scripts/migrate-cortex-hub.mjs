import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`cortex_hub_config\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`cortexBaseUrl\` varchar(512),
    \`cortexApiKey\` varchar(256),
    \`geniusApiKey\` varchar(256),
    \`status\` enum('connected','disconnected','error') DEFAULT 'disconnected',
    \`syncIntervalMinutes\` int DEFAULT 5,
    \`lastHealthCheck\` timestamp NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`genius_production_jobs\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`extensivCustomerId\` int NOT NULL,
    \`jobNumber\` varchar(64) NOT NULL,
    \`jobType\` enum('returns_processing','kitting','labeling','repackaging','inspection','other') NOT NULL,
    \`status\` enum('queued','in_progress','completed','on_hold','cancelled') NOT NULL DEFAULT 'queued',
    \`priority\` enum('low','normal','high','urgent') DEFAULT 'normal',
    \`unitCount\` int DEFAULT 0,
    \`completedUnits\` int DEFAULT 0,
    \`assignedTo\` varchar(255),
    \`startedAt\` timestamp NULL,
    \`completedAt\` timestamp NULL,
    \`cortexNotified\` tinyint(1) DEFAULT 0,
    \`notes\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`genius_materials_inventory\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`extensivCustomerId\` int NOT NULL,
    \`sku\` varchar(128) NOT NULL,
    \`description\` varchar(512),
    \`category\` varchar(128),
    \`quantityOnHand\` int NOT NULL DEFAULT 0,
    \`quantityAllocated\` int DEFAULT 0,
    \`quantityAvailable\` int DEFAULT 0,
    \`unitOfMeasure\` varchar(32) DEFAULT 'each',
    \`reorderPoint\` int,
    \`reorderQuantity\` int,
    \`location\` varchar(128),
    \`warehouseId\` varchar(64),
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`genius_cortex_events\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`eventType\` varchar(128) NOT NULL,
    \`sourcePlatform\` enum('cortex','clearsight','opfi') NOT NULL,
    \`payload\` json NOT NULL,
    \`status\` enum('received','processed','failed') NOT NULL DEFAULT 'received',
    \`processedAt\` timestamp NULL,
    \`errorMessage\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `INSERT IGNORE INTO \`cortex_hub_config\` (\`id\`, \`status\`) VALUES (1, 'disconnected')`,
];

for (const sql of statements) {
  const name = sql.trim().split("\n")[0].slice(0, 60);
  try {
    await conn.execute(sql);
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}

await conn.end();
console.log("\nMigration complete.");
