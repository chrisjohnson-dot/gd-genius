#!/usr/bin/env python3
"""
Seed mu_labels table from RENO and COL inventory Excel exports.
Facility IDs confirmed from server logs:
  COL-Columbus = facility_id 2
  RENO-Reno    = facility_id 3
Config ID = 3 (Go Direct)
"""
import os, sys, time
import pymysql
import pandas as pd
from urllib.parse import urlparse

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set"); sys.exit(1)

u = urlparse(DATABASE_URL)
conn = pymysql.connect(
    host=u.hostname, port=u.port or 3306,
    user=u.username, password=u.password,
    database=u.path.lstrip("/"), charset="utf8mb4",
    ssl={"ca": None}, ssl_verify_cert=False, ssl_verify_identity=False,
)
cur = conn.cursor(pymysql.cursors.DictCursor)

CONFIG_ID = 3
FILES = [
    {"path": "/home/ubuntu/upload/RENOinventoryGridExport-20260430020523.xlsx", "facility_id": 3, "label": "RENO"},
    {"path": "/home/ubuntu/upload/COLinventoryGridExport-20260430020523.xlsx",  "facility_id": 2, "label": "COL"},
]

now_ms = int(time.time() * 1000)
total_upserted = 0
total_skipped = 0

for f in FILES:
    print(f"\nProcessing {f['label']} (facility_id={f['facility_id']}) ...")
    df = pd.read_excel(f["path"])
    print(f"  Rows: {len(df)}, Columns: {list(df.columns)}")

    inserted = 0
    skipped = 0
    for _, row in df.iterrows():
        mu_label = row.get("Movable Unit")
        if pd.isna(mu_label) or str(mu_label).strip() in ("", "nan", "None"):
            skipped += 1
            continue

        mu_label_str = str(mu_label).strip()
        sku          = str(row.get("SKU", "")).strip()
        mu_type      = str(row.get("Movable Unit Type", "Pallet")).strip()
        qty_raw      = row.get("On Hand Primary", 0)
        qty          = int(qty_raw) if not pd.isna(qty_raw) else 0

        try:
            cur.execute(
                """INSERT INTO mu_labels
                     (config_id, facility_id, transaction_id, receiver_item_id,
                      sku, mu_label, mu_type, qty, synced_to_extensiv, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, %s)
                   ON DUPLICATE KEY UPDATE
                     sku        = VALUES(sku),
                     mu_type    = VALUES(mu_type),
                     qty        = VALUES(qty),
                     created_at = VALUES(created_at)""",
                (CONFIG_ID, f["facility_id"], None, None, sku, mu_label_str, mu_type, qty, now_ms)
            )
            inserted += 1
        except Exception as e:
            print(f"  ERROR MU={mu_label_str}: {e}")

    conn.commit()
    print(f"  Upserted: {inserted}, Skipped (no MU): {skipped}")
    total_upserted += inserted
    total_skipped += skipped

print(f"\n=== Done. Total upserted: {total_upserted}, skipped: {total_skipped} ===")

# Verify
cur.execute("SELECT facility_id, COUNT(*) as cnt FROM mu_labels GROUP BY facility_id")
counts = cur.fetchall()
print("mu_labels counts by facility_id:", counts)

# Sample a few records
cur.execute("SELECT facility_id, mu_label, sku, qty FROM mu_labels ORDER BY created_at DESC LIMIT 5")
samples = cur.fetchall()
print("Sample records:", samples)

cur.close()
conn.close()
