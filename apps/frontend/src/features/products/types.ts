export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: StockStatus;
  updatedAt: number;
}

export interface StockUpdate {
  id: string;
  stock: number;
}

export type CellAlign = "left" | "right";

export interface ColumnDefinition {
  key: keyof Pick<
    Product,
    "sku" | "name" | "category" | "price" | "stock" | "status" | "updatedAt"
  >;
  label: string;
  width: number;
  align: CellAlign;
}
