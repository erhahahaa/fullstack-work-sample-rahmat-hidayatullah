import { describe, expect, it } from "vite-plus/test";

import { generateProducts } from "@/features/products/data/generate-products";

describe("generateProducts", () => {
  it("produces deep-equal output for the same seed and count", () => {
    expect(generateProducts(50, 1234)).toEqual(generateProducts(50, 1234));
  });

  it("produces different output for different seeds", () => {
    expect(generateProducts(50, 1)).not.toEqual(generateProducts(50, 2));
  });

  it("creates unique zero padded ids and skus", () => {
    const products = generateProducts(120, 7);
    const ids = products.map((product) => product.id);
    const skus = products.map((product) => product.sku);

    expect(new Set(ids).size).toBe(products.length);
    expect(new Set(skus).size).toBe(products.length);

    for (const [index, product] of products.entries()) {
      const padded = String(index + 1).padStart(5, "0");
      expect(product.id).toBe(`p-${padded}`);
      expect(product.sku).toBe(`SKU-${padded}`);
    }
  });

  it("respects the requested count", () => {
    expect(generateProducts(0)).toEqual([]);
    expect(generateProducts(1)).toHaveLength(1);
    expect(generateProducts(275)).toHaveLength(275);
  });

  it("maps zero stock to out_of_stock", () => {
    const products = generateProducts(2000, 99);
    const zeroStock = products.filter((product) => product.stock === 0);
    const positiveStock = products.filter((product) => product.stock > 0);
    const zeroRate = zeroStock.length / products.length;

    expect(zeroStock.length).toBeGreaterThan(0);
    expect(zeroRate).toBeGreaterThan(0.04);
    expect(zeroRate).toBeLessThan(0.12);
    expect(zeroStock.every((product) => product.status === "out_of_stock")).toBe(true);
    expect(positiveStock.every((product) => product.status !== "out_of_stock")).toBe(true);
  });

  it("keeps prices and stock inside the configured ranges", () => {
    const products = generateProducts(500, 21);

    for (const product of products) {
      expect(product.price).toBeGreaterThanOrEqual(25_000);
      expect(product.price).toBeLessThanOrEqual(2_500_000);
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.stock).toBeLessThanOrEqual(250);
    }
  });

  it("clamps the count to the supported range", () => {
    expect(generateProducts(-10, 1)).toEqual([]);
    expect(generateProducts(Number.NaN, 1)).toEqual([]);

    const products = generateProducts(100_001, 1);

    expect(products).toHaveLength(100_000);
    expect(products.at(-1)?.id).toBe("p-100000");
  });
});
