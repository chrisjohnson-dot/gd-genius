import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("DESCRIBE rate_wizard_shipments");
rows.forEach(r => console.log(r.Field, r.Type, r.Null, r.Default));
await conn.end();
