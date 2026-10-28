const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("id-ID");

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDateTime(value: number): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatMilliseconds(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${value.toFixed(1)} ms`;
}

// Duration values are milliseconds and are shortened for compact labels.
export function formatDuration(value: number): string {
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}
