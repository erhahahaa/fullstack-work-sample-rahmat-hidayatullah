import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useProductStore } from "@/features/products/store/product-store";
import type { Product } from "@/features/products/types";

const BASE_UPDATED_AT = 1_700_000_000_000;

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    sku: `SKU-${id.slice(2)}`,
    name: `Product ${id}`,
    category: "Electronics",
    price: 150_000,
    stock: 40,
    status: "in_stock",
    updatedAt: BASE_UPDATED_AT,
    ...overrides,
  };
}

function seedStore(): void {
  useProductStore
    .getState()
    .reset([
      makeProduct("p-00001"),
      makeProduct("p-00002", { stock: 5, status: "low_stock" }),
      makeProduct("p-00003", { stock: 0, status: "out_of_stock" }),
    ]);
}

function getProduct(id: string): Product {
  const product = useProductStore.getState().byId[id];

  if (product === undefined) {
    throw new Error(`Missing product ${id}`);
  }

  return product;
}

beforeEach(() => {
  useProductStore.getState().reset([]);
});

describe("product store", () => {
  it("fills byId and allIds on reset", () => {
    seedStore();

    const state = useProductStore.getState();

    expect(state.allIds).toEqual(["p-00001", "p-00002", "p-00003"]);
    expect(Object.keys(state.byId)).toHaveLength(3);
    expect(state.byId["p-00001"]?.stock).toBe(40);
    expect(state.byId["p-00002"]?.stock).toBe(5);
    expect(state.byId["p-00003"]?.stock).toBe(0);
  });

  it("replaces only the target entity on updateStock", () => {
    seedStore();

    const before = useProductStore.getState();
    const allIds = before.allIds;
    const target = getProduct("p-00001");
    const unrelated = before.byId["p-00002"];
    const untouched = before.byId["p-00003"];

    useProductStore.getState().updateStock("p-00001", 7);

    const after = useProductStore.getState();

    expect(after.allIds).toBe(allIds);
    expect(after.byId["p-00001"]).not.toBe(target);
    expect(after.byId["p-00001"]?.stock).toBe(7);
    expect(after.byId["p-00002"]).toBe(unrelated);
    expect(after.byId["p-00003"]).toBe(untouched);
  });

  it("applies updateMany in one pass and skips unknown or unchanged rows", () => {
    seedStore();

    const before = useProductStore.getState();
    const allIds = before.allIds;
    const noOp = before.byId["p-00002"];

    useProductStore.getState().updateMany([
      { id: "p-00001", stock: 0 },
      { id: "p-00003", stock: 12 },
      { id: "p-00002", stock: 5 },
      { id: "p-99999", stock: 3 },
    ]);

    const after = useProductStore.getState();

    expect(after.allIds).toBe(allIds);
    expect(after.byId["p-00001"]?.stock).toBe(0);
    expect(after.byId["p-00001"]?.status).toBe("out_of_stock");
    expect(after.byId["p-00003"]?.stock).toBe(12);
    expect(after.byId["p-00003"]?.status).toBe("in_stock");
    expect(after.byId["p-00002"]).toBe(noOp);
    expect(after.byId["p-99999"]).toBeUndefined();
    expect(Object.keys(after.byId)).toHaveLength(3);
  });

  it("recomputes status and updatedAt when stock changes", () => {
    useProductStore.getState().reset([
      makeProduct("p-00010", {
        stock: 40,
        status: "in_stock",
        updatedAt: BASE_UPDATED_AT,
      }),
    ]);

    useProductStore.getState().updateStock("p-00010", 0);
    let updated = getProduct("p-00010");
    expect(updated.status).toBe("out_of_stock");
    expect(updated.updatedAt).toBeGreaterThan(BASE_UPDATED_AT);

    useProductStore.getState().updateStock("p-00010", 5);
    updated = getProduct("p-00010");
    expect(updated.status).toBe("low_stock");
    expect(updated.updatedAt).toBeGreaterThan(BASE_UPDATED_AT);

    useProductStore.getState().updateStock("p-00010", 250);
    updated = getProduct("p-00010");
    expect(updated.stock).toBe(250);
    expect(updated.status).toBe("in_stock");
    expect(updated.updatedAt).toBeGreaterThan(BASE_UPDATED_AT);
  });
});
