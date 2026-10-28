import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createDatabase, type AppDatabase } from "../db";
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

interface PaymentBody {
  orderId: string;
  status: string;
  amount: number;
}

interface ErrorBody {
  error: string;
}

interface CountRow {
  count: number;
}

let database: AppDatabase;
let app: ReturnType<typeof createApp>;

async function sendEvent(
  event: PaymentEvent,
  options: { timestamp?: string; signature?: string } = {},
): Promise<Response> {
  const rawBody = JSON.stringify(event);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = options.signature ?? signPayload(resolveWebhookSecret(), timestamp, rawBody);

  return app.request("/api/webhooks/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    },
    body: rawBody,
  });
}

function paymentEvent(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    id: "evt-1",
    type: "payment.updated",
    orderId: "order-1",
    status: "paid",
    amount: 1500,
    ...overrides,
  };
}

beforeEach(() => {
  database = createDatabase(":memory:");
  app = createApp(database.db);
});

afterEach(() => {
  database.close();
});

describe("payment webhooks", () => {
  test("a valid signed event is processed once", async () => {
    const response = await sendEvent(paymentEvent());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: false });

    const payment = await app.request("/api/payments/order-1");
    expect(payment.status).toBe(200);
    expect(await payment.json()).toEqual({
      orderId: "order-1",
      status: "paid",
      amount: 1500,
    });
  });

  test("a replay is reported as duplicate and does not create a second payment", async () => {
    const event = paymentEvent({ id: "evt-replay" });

    const first = await sendEvent(event);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, duplicate: false });

    const replay = await sendEvent(event);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });

    const row = database.db
      .prepare<CountRow, [string]>("SELECT COUNT(*) AS count FROM payments WHERE order_id = ?")
      .get("order-1");
    expect(row?.count).toBe(1);
  });

  test("an invalid signature returns 401", async () => {
    const response = await sendEvent(paymentEvent(), { signature: "0".repeat(64) });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "INVALID_SIGNATURE" });
  });

  test("a stale timestamp returns 401", async () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const response = await sendEvent(paymentEvent(), { timestamp: staleTimestamp });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error).toBe("INVALID_SIGNATURE");
  });

  test("a paid payment accepts a later refund", async () => {
    const paid = await sendEvent(
      paymentEvent({ id: "evt-paid-refund", status: "paid", amount: 2000 }),
    );
    expect(paid.status).toBe(200);

    const refunded = await sendEvent(
      paymentEvent({ id: "evt-refunded", status: "refunded", amount: 2000 }),
    );
    expect(refunded.status).toBe(200);
    expect(await refunded.json()).toEqual({ received: true, duplicate: false });

    const payment = await app.request("/api/payments/order-1");
    expect(await payment.json()).toEqual({
      orderId: "order-1",
      status: "refunded",
      amount: 2000,
    } satisfies PaymentBody);
  });

  test("a paid payment ignores a later failed event", async () => {
    const paid = await sendEvent(paymentEvent({ id: "evt-paid", status: "paid", amount: 2000 }));
    expect(paid.status).toBe(200);

    const failed = await sendEvent(
      paymentEvent({ id: "evt-failed", status: "failed", amount: 2000 }),
    );
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual({ received: true, ignored: true });

    const payment = await app.request("/api/payments/order-1");
    expect(await payment.json()).toEqual({
      orderId: "order-1",
      status: "paid",
      amount: 2000,
    } satisfies PaymentBody);
  });
});
