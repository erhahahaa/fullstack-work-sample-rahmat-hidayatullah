import { act, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { CSSProperties } from "react";

import { ProductCell } from "@/features/products/components/product-cell";
import { PRODUCT_COLUMNS, ROW_HEIGHT } from "@/features/products/components/table-columns";
import { productMetrics } from "@/features/products/metrics/metrics-store";
import { useProductStore } from "@/features/products/store/product-store";
import type { ColumnDefinition, Product } from "@/features/products/types";

const PRODUCT_A: Product = {
  id: "product-a",
  sku: "SKU-A",
  name: "Anvil",
  category: "Hardware",
  price: 129.5,
  stock: 42,
  status: "in_stock",
  updatedAt: 1_700_000_000_000,
};

const PRODUCT_B: Product = {
  id: "product-b",
  sku: "SKU-B",
  name: "Bracket",
  category: "Hardware",
  price: 4.25,
  stock: 9,
  status: "low_stock",
  updatedAt: 1_700_000_000_000,
};

const CELL_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 100,
  height: ROW_HEIGHT,
};

function getColumn(key: ColumnDefinition["key"]): ColumnDefinition {
  const column = PRODUCT_COLUMNS.find((candidate) => candidate.key === key);

  if (column === undefined) {
    throw new Error(`Missing test column: ${key}`);
  }

  return column;
}

const stockColumn = getColumn("stock");

beforeEach(() => {
  useProductStore.getState().reset([PRODUCT_A, PRODUCT_B]);
  productMetrics.reset();
});

describe("ProductCell", () => {
  it("re-renders when its own product field changes", () => {
    render(
      <ProductCell
        productId={PRODUCT_A.id}
        column={stockColumn}
        rowIndex={0}
        style={CELL_STYLE}
        align="right"
      />,
    );

    expect(screen.getByText("42")).toBeInTheDocument();

    act(() => {
      useProductStore.getState().updateStock(PRODUCT_A.id, 8);
    });

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("does not re-render a cell whose product did not change", () => {
    const renders = { first: 0, second: 0 };

    render(
      <>
        <Profiler
          id="first"
          onRender={() => {
            renders.first += 1;
          }}
        >
          <div data-testid="first-cell">
            <ProductCell
              productId={PRODUCT_A.id}
              column={stockColumn}
              rowIndex={0}
              style={CELL_STYLE}
              align="right"
            />
          </div>
        </Profiler>
        <Profiler
          id="second"
          onRender={() => {
            renders.second += 1;
          }}
        >
          <div data-testid="second-cell">
            <ProductCell
              productId={PRODUCT_B.id}
              column={stockColumn}
              rowIndex={1}
              style={CELL_STYLE}
              align="right"
            />
          </div>
        </Profiler>
      </>,
    );

    expect(screen.getByTestId("first-cell")).toHaveTextContent("42");
    expect(screen.getByTestId("second-cell")).toHaveTextContent("9");

    renders.first = 0;
    renders.second = 0;

    act(() => {
      useProductStore.getState().updateStock(PRODUCT_A.id, 8);
    });

    expect(renders.first).toBeGreaterThan(0);
    expect(renders.second).toBe(0);
    expect(screen.getByTestId("first-cell")).toHaveTextContent("8");
    expect(screen.getByTestId("second-cell")).toHaveTextContent("9");
  });
});
