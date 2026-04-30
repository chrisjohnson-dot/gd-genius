import { getDb } from '../server/db.js';
import { sql } from 'drizzle-orm';

const db = await getDb();
if (!db) { console.error('No DB connection'); process.exit(1); }

// Create the table if it doesn't exist
await db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS \`sku_weight_overrides\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    \`config_id\` int NOT NULL,
    \`customer_id\` int NOT NULL,
    \`sku\` varchar(100) NOT NULL,
    \`carton_weight_lb\` decimal(10,4) NOT NULL,
    \`units_per_carton\` int,
    \`note\` varchar(256),
    \`created_at\` timestamp NOT NULL DEFAULT NOW(),
    \`updated_at\` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY \`sku_weight_overrides_config_sku_unique\` (\`config_id\`, \`customer_id\`, \`sku\`)
  )
`));

// Verify
const result = await db.execute(sql.raw('SELECT COUNT(*) as cnt FROM sku_weight_overrides'));
console.log('Table sku_weight_overrides OK, rows:', (result[0] as any)?.[0]?.cnt ?? 0);
process.exit(0);
