import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const [,, username, password, name, role = "qc_operator"] = process.argv;
if (!username || !password || !name) {
  console.error("Usage: node create-team-account.mjs <username> <password> <name> [role]");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const conn = await createConnection(url);
await conn.execute(
  "INSERT INTO team_accounts (username, passwordHash, name, role, active) VALUES (?, ?, ?, ?, true) ON DUPLICATE KEY UPDATE passwordHash=VALUES(passwordHash), name=VALUES(name), role=VALUES(role), active=true",
  [username, passwordHash, name, role]
);
console.log(`Team account created: username=${username}, name=${name}, role=${role}`);
await conn.end();
