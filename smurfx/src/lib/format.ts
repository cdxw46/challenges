export const formatPrice = (value: number, currency = "EUR", locale = "es-ES") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);

export const formatDate = (date: Date | string, locale = "es-ES") => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);
};

export const formatDateTime = (date: Date | string, locale = "es-ES") => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
};

export function effectivePrice(base: number, sale?: number | null) {
  return typeof sale === "number" && sale > 0 && sale < base ? sale : base;
}

export function discountPct(base: number, sale?: number | null) {
  if (!sale || sale >= base) return 0;
  return Math.round(((base - sale) / base) * 100);
}
