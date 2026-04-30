import mysql from "mysql2/promise";

const muLabel = process.argv[2] ?? "199806";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);

  // First check what columns exist
  const [cols] = await conn.execute("SHOW COLUMNS FROM mu_labels") as any;
  console.log("mu_labels columns:", (cols as any[]).map((c: any) => c.Field).join(", "));

  const [rows] = await conn.execute(
    "SELECT * FROM mu_labels WHERE mu_label = ? LIMIT 10",
    [muLabel]
  );
  console.log(`mu_labels rows for ${muLabel}:`, JSON.stringify(rows, null, 2));

  const [count] = await conn.execute("SELECT COUNT(*) as cnt FROM mu_labels") as any;
  console.log("Total mu_labels rows:", count[0].cnt);

  const [sample] = await conn.execute(
    "SELECT mu_label, sku, config_id, receiver_item_id FROM mu_labels LIMIT 5"
  );
  console.log("Sample mu_labels:", JSON.stringify(sample, null, 2));

  // Check if the mu_label column has the right value type
  const [colInfo] = await conn.execute(
    "SHOW COLUMNS FROM mu_labels LIKE 'mu_label'"
  );
  console.log("mu_label column info:", JSON.stringify(colInfo, null, 2));

  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
