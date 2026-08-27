export function money(minor, currency = "KES") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(minor || 0) / 100);
}
