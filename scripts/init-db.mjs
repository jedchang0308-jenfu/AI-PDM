import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "./pdm-paths.mjs";

const root = process.cwd();
const dataDir = getDataDir(root);
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.exec(fs.readFileSync(schemaPath, "utf8"));
db.close();

console.log(`Initialized SQLite database at ${dbPath}`);
