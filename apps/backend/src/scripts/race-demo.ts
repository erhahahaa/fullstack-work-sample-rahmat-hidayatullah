import type { Database } from "bun:sqlite";
import { createDatabase, seedInventory } from "../db";
import { createApp } from "../index";

interface PurchaseResponse {
  orderId?: string;
  sku?: string;
  qty?: number;
  remaining?: number;
  error?: string;
}

interface StockRow {
  stock: number;
}

interface RaceResult {
  status: number;
  body: PurchaseResponse | null;
}

const TOTAL_REQUESTS = 100;
const SKU = "limited";

async function sendPurchase(baseUrl: string, requestId: number): Promise<RaceResult> {
  try {
    const response = await fetch(`${baseUrl}/api/flash-sale/${SKU}/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `race-${requestId}`,
      },
      body: JSON.stringify({ qty: 1 }),
    });
    const body = (await response.json()) as PurchaseResponse;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function readStock(db: Database): number {
  const row = db.prepare<StockRow, [string]>("SELECT stock FROM inventory WHERE sku = ?").get(SKU);
  return row?.stock ?? -1;
}

function printTable(rows: ReadonlyArray<{ metric: string; value: number }>): void {
  const labelWidth = Math.max(...rows.map((row) => row.metric.length), "metric".length);
  console.log(`${"metric".padEnd(labelWidth)}  value`);
  for (const row of rows) {
    console.log(`${row.metric.padEnd(labelWidth)}  ${row.value}`);
  }
}

const database = createDatabase(":memory:");
seedInventory(database.db, [{ sku: SKU, stock: 1 }]);
const app = createApp(database.db);
const server = Bun.serve({ port: 0, fetch: app.fetch });
const baseUrl = `http://localhost:${server.port}`;

let exitCode = 0;

try {
  const results = await Promise.all(
    Array.from({ length: TOTAL_REQUESTS }, (_, index) => sendPurchase(baseUrl, index)),
  );

  const successes = results.filter((result) => result.status === 201).length;
  const outOfStock = results.filter(
    (result) => result.status === 409 && result.body?.error === "OUT_OF_STOCK",
  ).length;
  const unexpected = results.length - successes - outOfStock;
  const finalStock = readStock(database.db);

  printTable([
    { metric: "total requests", value: results.length },
    { metric: "successes", value: successes },
    { metric: "out-of-stock rejections", value: outOfStock },
    { metric: "unexpected errors", value: unexpected },
    { metric: "final stock", value: finalStock },
  ]);

  // SQLite serializes writes, so this verifies the guard clause rather than lock contention.
  if (successes !== 1 || finalStock !== 0) {
    console.log("INVARIANT FAILED: expected exactly one success and final stock 0");
    exitCode = 1;
  } else {
    console.log("Invariant held: exactly one purchase succeeded and final stock is 0");
  }
} finally {
  server.stop(true);
  database.close();
}

process.exitCode = exitCode;
