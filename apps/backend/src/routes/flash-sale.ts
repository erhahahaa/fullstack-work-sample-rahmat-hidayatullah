import type { Database } from "bun:sqlite";
import { Hono } from "hono";

interface OrderRow {
  id: string;
  sku: string;
  qty: number;
  idempotency_key: string;
  created_at: string;
}

interface StockRow {
  stock: number;
}

type PurchaseOutcome =
  | { kind: "created"; order: OrderRow; remaining: number }
  | { kind: "replayed"; order: OrderRow; remaining: number }
  | { kind: "missing" }
  | { kind: "out-of-stock" };

function readQty(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!("qty" in record)) {
    return 1;
  }

  const qty = record.qty;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
    return null;
  }

  return qty;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function createFlashSaleRoutes(db: Database): Hono {
  const app = new Hono();

  const findOrderByKey = db.prepare<OrderRow, [string]>(
    "SELECT id, sku, qty, idempotency_key, created_at FROM orders WHERE idempotency_key = ?",
  );
  const findStock = db.prepare<StockRow, [string]>("SELECT stock FROM inventory WHERE sku = ?");
  const decrementStock = db.prepare<unknown, [number, string, number]>(
    "UPDATE inventory SET stock = stock - ? WHERE sku = ? AND stock >= ?",
  );
  const insertOrder = db.prepare<unknown, [string, string, number, string, string]>(
    "INSERT INTO orders (id, sku, qty, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  const purchase = db.transaction(
    (sku: string, qty: number, idempotencyKey: string): PurchaseOutcome => {
      const existing = findOrderByKey.get(idempotencyKey);
      if (existing) {
        return {
          kind: "replayed",
          order: existing,
          remaining: findStock.get(existing.sku)?.stock ?? 0,
        };
      }

      const update = decrementStock.run(qty, sku, qty);
      if (update.changes === 0) {
        const stock = findStock.get(sku);
        return stock ? { kind: "out-of-stock" } : { kind: "missing" };
      }

      const order: OrderRow = {
        id: crypto.randomUUID(),
        sku,
        qty,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
      };
      insertOrder.run(order.id, order.sku, order.qty, order.idempotency_key, order.created_at);

      return { kind: "created", order, remaining: findStock.get(sku)?.stock ?? 0 };
    },
  );

  app.post("/flash-sale/:sku/purchase", async (c) => {
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      return c.json({ error: "MISSING_IDEMPOTENCY_KEY" }, 400);
    }

    const contentType = c.req.header("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      return c.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    }

    const rawBody = await c.req.text();
    let parsed: unknown = {};
    if (rawBody.trim() !== "") {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return c.json({ error: "INVALID_JSON" }, 400);
      }
    }

    const qty = readQty(parsed);
    if (qty === null) {
      return c.json({ error: "INVALID_QTY" }, 400);
    }

    const sku = c.req.param("sku");
    let outcome: PurchaseOutcome;
    try {
      outcome = purchase(sku, qty, idempotencyKey);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = findOrderByKey.get(idempotencyKey);
      if (!existing) {
        throw error;
      }

      return c.json(
        {
          orderId: existing.id,
          sku: existing.sku,
          qty: existing.qty,
          remaining: findStock.get(existing.sku)?.stock ?? 0,
          replayed: true,
        },
        200,
      );
    }

    switch (outcome.kind) {
      case "created":
        return c.json(
          {
            orderId: outcome.order.id,
            sku: outcome.order.sku,
            qty: outcome.order.qty,
            remaining: outcome.remaining,
          },
          201,
        );
      case "replayed":
        return c.json(
          {
            orderId: outcome.order.id,
            sku: outcome.order.sku,
            qty: outcome.order.qty,
            remaining: outcome.remaining,
            replayed: true,
          },
          200,
        );
      case "missing":
        return c.json({ error: "NOT_FOUND", sku }, 404);
      case "out-of-stock":
        return c.json({ error: "OUT_OF_STOCK", sku }, 409);
    }
  });

  app.get("/inventory/:sku", (c) => {
    const sku = c.req.param("sku");
    const stock = findStock.get(sku);
    if (!stock) {
      return c.json({ error: "NOT_FOUND", sku }, 404);
    }

    return c.json({ sku, stock: stock.stock });
  });

  return app;
}
