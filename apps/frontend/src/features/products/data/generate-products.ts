import { statusForStock } from "@/features/products/lib/stock-status";
import type { Product } from "@/features/products/types";

const MIN_COUNT = 0;
const MAX_COUNT = 100_000;
const DEFAULT_SEED = 42;

const MIN_PRICE = 25_000;
const MAX_PRICE = 2_500_000;
const PRICE_ROUNDING = 500;

const MAX_STOCK = 250;
const OUT_OF_STOCK_RATE = 0.08;

const BASE_UPDATED_AT = Date.UTC(2026, 0, 1);
const MAX_AGE_MINUTES = 90 * 24 * 60;

const ADJECTIVES = [
  "Aurora",
  "Nimbus",
  "Cobalt",
  "Lumen",
  "Verdant",
  "Solstice",
  "Ember",
  "Meridian",
  "Halcyon",
  "Zephyr",
  "Onyx",
  "Cascade",
] as const;

const NOUNS_BY_CATEGORY: Readonly<Record<string, readonly string[]>> = {
  Electronics: [
    "Wireless Keyboard",
    "Noise Cancelling Headphones",
    "Mechanical Mouse",
    "Portable Monitor",
    "Bluetooth Speaker",
  ],
  Fashion: ["Linen Jacket", "Canvas Sneakers", "Wool Scarf", "Leather Belt", "Everyday Tote"],
  Home: ["Ceramic Mug", "Table Lamp", "Cotton Throw", "Storage Basket", "Scented Candle"],
  Beauty: ["Hydrating Serum", "Cleansing Balm", "Mineral Sunscreen", "Lip Tint", "Body Lotion"],
  Sports: ["Yoga Mat", "Running Bottle", "Resistance Band", "Training Shorts", "Foam Roller"],
  Books: ["Notebook Set", "Pocket Atlas", "Recipe Collection", "Essay Anthology", "Field Guide"],
};

const CATEGORIES = Object.keys(NOUNS_BY_CATEGORY);
const DEFAULT_CATEGORY = "Electronics";
const DEFAULT_NOUN = "Wireless Keyboard";

// mulberry32 keeps output reproducible for a given seed without Math.random.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(random: () => number, values: readonly T[], fallback: T): T {
  const index = Math.floor(random() * values.length);
  return values[index] ?? fallback;
}

function normalizeCount(count: number): number {
  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.trunc(count)));
}

export function generateProducts(count: number, seed: number = DEFAULT_SEED): Product[] {
  const total = normalizeCount(count);
  const random = createRandom(seed);
  const products: Product[] = [];

  for (let index = 0; index < total; index += 1) {
    const paddedIndex = String(index + 1).padStart(5, "0");
    const adjective = pick(random, ADJECTIVES, "Aurora");
    const category = pick(random, CATEGORIES, DEFAULT_CATEGORY);
    const nouns = NOUNS_BY_CATEGORY[category] ?? [DEFAULT_NOUN];
    const noun = pick(random, nouns, DEFAULT_NOUN);
    const rawPrice = randomInt(random, MIN_PRICE, MAX_PRICE);
    const price = Math.round(rawPrice / PRICE_ROUNDING) * PRICE_ROUNDING;
    const stock = random() < OUT_OF_STOCK_RATE ? 0 : randomInt(random, 1, MAX_STOCK);
    const ageMinutes = randomInt(random, 0, MAX_AGE_MINUTES);

    products.push({
      id: `p-${paddedIndex}`,
      sku: `SKU-${paddedIndex}`,
      name: `${adjective} ${noun}`,
      category,
      price,
      stock,
      status: statusForStock(stock),
      updatedAt: BASE_UPDATED_AT - ageMinutes * 60_000,
    });
  }

  return products;
}
