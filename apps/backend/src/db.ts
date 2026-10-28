import { Database } from "bun:sqlite";

export interface AppDatabase {
  db: Database;
  close(): void;
}

export interface InventoryRow {
  sku: string;
  stock: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS inventory (
  sku TEXT PRIMARY KEY,
  stock INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  qty INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function createDatabase(path?: string): AppDatabase {
  const resolvedPath = path ?? process.env.DB_PATH ?? "local.db";
  const db = new Database(resolvedPath, { create: true });

  db.exec("PRAGMA foreign_keys = ON;");
  if (resolvedPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);

  return {
    db,
    close: () => {
      db.close();
    },
  };
}

export function seedInventory(db: Database, rows: readonly InventoryRow[]): void {
  const statement = db.prepare<unknown, [string, number]>(
    `INSERT INTO inventory (sku, stock)
     VALUES (?, ?)
     ON CONFLICT(sku) DO UPDATE SET stock = excluded.stock`,
  );

  const seed = db.transaction((items: readonly InventoryRow[]) => {
    for (const item of items) {
      statement.run(item.sku, item.stock);
    }
  });

  seed(rows);
}
