import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createDatabase, seedInventory, type AppDatabase } from "../db";
import { createApp } from "../index";

interface ErrorBody {
  error: string;
}

interface PurchaseBody {
  orderId: string;
  sku: string;
  qty: number;
  remaining: number;
  replayed?: boolean;
}

let database: AppDatabase;
let app: ReturnType<typeof createApp>;

async function purchase(sku: string, key: string, body: unknown = { qty: 1 }): Promise<Response> {
  return app.request(`/api/flash-sale/${sku}/purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  database = createDatabase(":memory:");
  seedInventory(database.db, [
    { sku: "last-unit", stock: 1 },
    { sku: "ample", stock: 10 },
  ]);
  app = createApp(database.db);
});

afterEach(() => {
  database.close();
});

describe("flash sale purchases", () => {
  test("exactly one of five concurrent purchases of the last unit succeeds", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) => purchase("last-unit", `concurrent-${index}`)),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(4);

    const inventory = await app.request("/api/inventory/last-unit");
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).toEqual({ sku: "last-unit", stock: 0 });
  });

  test("replaying the same idempotency key returns the same order without decrementing stock twice", async () => {
    const first = await purchase("last-unit", "replay-key");
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as PurchaseBody;

    const second = await purchase("last-unit", "replay-key");
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as PurchaseBody;

    expect(secondBody.replayed).toBe(true);
    expect(secondBody.orderId).toBe(firstBody.orderId);
    expect(secondBody.qty).toBe(firstBody.qty);

    const inventory = await app.request("/api/inventory/last-unit");
    expect(await inventory.json()).toEqual({ sku: "last-unit", stock: 0 });
  });

  test("invalid quantities return 400", async () => {
    for (const qty of [0, -1, 1.5, "2"]) {
      const response = await purchase("ample", `invalid-${String(qty)}`, { qty });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error).toBe("INVALID_QTY");
    }
  });

  test("unknown sku returns 404 consistently", async () => {
    const purchaseResponse = await purchase("missing-sku", "missing-key");
    expect(purchaseResponse.status).toBe(404);
    expect(((await purchaseResponse.json()) as ErrorBody).error).toBe("NOT_FOUND");

    const inventoryResponse = await app.request("/api/inventory/missing-sku");
    expect(inventoryResponse.status).toBe(404);
    expect(((await inventoryResponse.json()) as ErrorBody).error).toBe("NOT_FOUND");
  });
});
