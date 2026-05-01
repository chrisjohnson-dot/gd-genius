import pymysql, os, re

url = os.environ['DATABASE_URL']
# Strip the ?ssl=... query string from the database name
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', url)
if not m:
    raise ValueError(f"Could not parse DATABASE_URL: {url[:60]}...")

host, port, user, password, database = m[3], int(m[4]), m[1], m[2], m[5]
print(f"Connecting to {host}:{port} db={database}")

conn = pymysql.connect(
    host=host, port=port, user=user, password=password, database=database,
    ssl={'fake_flag_to_enable_tls': True}
)
cur = conn.cursor()

for col, ddl in [
    ('bolUrl', 'ALTER TABLE pickup_sessions ADD COLUMN bolUrl VARCHAR(1024) NULL'),
    ('signedBolUrl', 'ALTER TABLE pickup_sessions ADD COLUMN signedBolUrl VARCHAR(1024) NULL'),
]:
    try:
        cur.execute(ddl)
        print(f'{col}: added')
    except Exception as e:
        print(f'{col}: {e}')

conn.commit()
conn.close()
print('Done')
