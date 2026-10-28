import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { verifySignature } from "../lib/hmac";

export const DEFAULT_WEBHOOK_SECRET = "dev-webhook-secret";

export function resolveWebhookSecret(): string {
  return process.env.WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
}

type PaymentStatus = "paid" | "failed" | "refunded";

interface PaymentEvent {
  id: string;
  type: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
}

interface PaymentRow {
  order_id: string;
  status: PaymentStatus;
  amount: number;
  updated_at: string;
}

type ApplyOutcome = { kind: "processed" } | { kind: "duplicate" } | { kind: "ignored" };

// paid to refunded is legitimate. paid to failed, or any move out of a final
// state, is a stale or fabricated event and must not overwrite a settled payment.
const ALLOWED_TRANSITIONS: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  paid: new Set<PaymentStatus>(["refunded"]),
  failed: new Set<PaymentStatus>(),
  refunded: new Set<PaymentStatus>(),
};

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "paid" || value === "failed" || value === "refunded";
}

function parseEvent(rawBody: string): PaymentEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { id, type, orderId, status, amount } = record;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  if (typeof type !== "string" || type.length === 0) {
    return null;
  }
  if (typeof orderId !== "string" || orderId.length === 0) {
    return null;
  }
  if (!isPaymentStatus(status)) {
    return null;
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    return null;
  }

  return { id, type, orderId, status, amount };
}

export function createWebhookRoutes(db: Database): Hono {
  const app = new Hono();

  const insertEvent = db.prepare<unknown, [string, string, string, string]>(
    `INSERT OR IGNORE INTO webhook_events (event_id, event_type, payload, received_at)
     VALUES (?, ?, ?, ?)`,
  );
  const findPayment = db.prepare<PaymentRow, [string]>(
    "SELECT order_id, status, amount, updated_at FROM payments WHERE order_id = ?",
  );
  const upsertPayment = db.prepare<unknown, [string, string, number, string]>(
    `INSERT INTO payments (order_id, status, amount, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       status = excluded.status,
       amount = excluded.amount,
       updated_at = excluded.updated_at`,
  );

  const applyEvent = db.transaction(
    (event: PaymentEvent, payload: string, receivedAt: string): ApplyOutcome => {
      const inserted = insertEvent.run(event.id, event.type, payload, receivedAt);
      if (inserted.changes === 0) {
        return { kind: "duplicate" };
      }

      const existing = findPayment.get(event.orderId);
      if (existing && existing.status !== event.status) {
        const allowed = ALLOWED_TRANSITIONS[existing.status];
        if (!allowed.has(event.status)) {
          return { kind: "ignored" };
        }
      }

      upsertPayment.run(event.orderId, event.status, event.amount, receivedAt);
      return { kind: "processed" };
    },
  );

  app.post("/webhooks/payments", async (c) => {
    const rawBody = await c.req.text();
    const timestamp = c.req.header("X-Timestamp");
    const signature = c.req.header("X-Signature");
    if (!timestamp || !signature) {
      return c.json({ error: "INVALID_SIGNATURE" }, 401);
    }

    if (!verifySignature(resolveWebhookSecret(), timestamp, rawBody, signature)) {
      return c.json({ error: "INVALID_SIGNATURE" }, 401);
    }

    const event = parseEvent(rawBody);
    if (!event) {
      return c.json({ error: "INVALID_PAYLOAD" }, 400);
    }

    const outcome = applyEvent(event, rawBody, new Date().toISOString());
    switch (outcome.kind) {
      case "duplicate":
        return c.json({ received: true, duplicate: true }, 200);
      case "ignored":
        return c.json({ received: true, ignored: true }, 200);
      case "processed":
        return c.json({ received: true, duplicate: false }, 200);
    }
  });

  app.get("/payments/:orderId", (c) => {
    const orderId = c.req.param("orderId");
    const payment = findPayment.get(orderId);
    if (!payment) {
      return c.json({ error: "NOT_FOUND", orderId }, 404);
    }

    return c.json({
      orderId: payment.order_id,
      status: payment.status,
      amount: payment.amount,
    });
  });

  return app;
}
