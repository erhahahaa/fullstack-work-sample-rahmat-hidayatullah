import type { Database } from "bun:sqlite";
import { createDatabase } from "../db";
import { createApp } from "../index";
import { signPayload } from "../lib/hmac";
import { resolveWebhookSecret } from "../routes/webhooks";

interface PaymentEvent {
  id: string;
  type: string;
  orderId: string;
  status: string;
  amount: number;
}

interface WebhookResponse {
  received?: boolean;
  duplicate?: boolean;
  ignored?: boolean;
  error?: string;
}

interface CountRow {
  count: number;
}

interface DemoResponse {
  status: number;
  body: WebhookResponse | null;
}

const ORDER_ID = "order-demo";
const EVENT_ID = "evt-demo-payment";

function seedOrder(db: Database): void {
  db.prepare<unknown, [string, string, number, string, string]>(
    `INSERT INTO orders (id, sku, qty, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(ORDER_ID, "demo-sku", 1, "demo-order-key", new Date().toISOString());
}

async function sendWebhook(
  baseUrl: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): Promise<DemoResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/webhooks/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-Signature": signature,
      },
      body: rawBody,
    });
    const body = (await response.json()) as WebhookResponse;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function countPayments(db: Database): number {
  const row = db
    .prepare<CountRow, [string]>("SELECT COUNT(*) AS count FROM payments WHERE order_id = ?")
    .get(ORDER_ID);
  return row?.count ?? 0;
}

function printTable(rows: ReadonlyArray<{ metric: string; value: number }>): void {
  const labelWidth = Math.max(...rows.map((row) => row.metric.length), "metric".length);
  console.log(`${"metric".padEnd(labelWidth)}  value`);
  for (const row of rows) {
    console.log(`${row.metric.padEnd(labelWidth)}  ${row.value}`);
  }
}

const database = createDatabase(":memory:");
seedOrder(database.db);
const app = createApp(database.db);
const server = Bun.serve({ port: 0, fetch: app.fetch });
const baseUrl = `http://localhost:${server.port}`;

const event: PaymentEvent = {
  id: EVENT_ID,
  type: "payment.updated",
  orderId: ORDER_ID,
  status: "paid",
  amount: 1999,
};
const rawBody = JSON.stringify(event);
const timestamp = String(Math.floor(Date.now() / 1000));
const secret = resolveWebhookSecret();
const signature = signPayload(secret, timestamp, rawBody);

let exitCode = 0;

try {
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => sendWebhook(baseUrl, rawBody, timestamp, signature)),
  );

  const sequential: DemoResponse[] = [];
  for (let index = 0; index < 5; index += 1) {
    sequential.push(await sendWebhook(baseUrl, rawBody, timestamp, signature));
  }

  const responses = [...concurrent, ...sequential];
  const processed = responses.filter((response) => response.body?.duplicate === false).length;
  const duplicates = responses.filter((response) => response.body?.duplicate === true).length;
  const unexpected = responses.filter((response) => response.status !== 200).length;
  const paymentRows = countPayments(database.db);

  const badSignature = await sendWebhook(baseUrl, rawBody, timestamp, "0".repeat(64));

  printTable([
    { metric: "total requests", value: responses.length },
    { metric: "processed", value: processed },
    { metric: "duplicates", value: duplicates },
    { metric: "unexpected responses", value: unexpected },
    { metric: "payment rows", value: paymentRows },
    { metric: "bad signature status", value: badSignature.status },
  ]);

  if (processed !== 1 || paymentRows !== 1) {
    console.log("INVARIANT FAILED: expected one processed event and one payment row");
    exitCode = 1;
  } else {
    console.log("Invariant held: one payment was processed and later deliveries were duplicates");
  }
} finally {
  server.stop(true);
  database.close();
}

process.exitCode = exitCode;
