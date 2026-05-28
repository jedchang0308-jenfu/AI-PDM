import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dataDir = process.env.PDM_DATA_DIR
  ? path.resolve(root, process.env.PDM_DATA_DIR)
  : path.join(root, "data");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.exec(fs.readFileSync(schemaPath, "utf8"));
db.close();

console.log(`Initialized SQLite database at ${dbPath}`);
