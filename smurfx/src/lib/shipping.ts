export const SHIPPING_FREE_THRESHOLD = 50;
export const TAX_RATE = 0.21;

export type ShippingOption = { id: string; label: string; price: number; eta: string };

export const SHIPPING_OPTIONS: ShippingOption[] = [
  { id: "standard", label: "Estándar (3-5 días)", price: 4.99, eta: "3-5 días" },
  { id: "express", label: "Express (1-2 días)", price: 9.99, eta: "1-2 días" },
  { id: "same_day", label: "Same day (Madrid/Barcelona)", price: 14.99, eta: "Hoy" },
  { id: "pickup", label: "Recogida en punto", price: 2.99, eta: "2-4 días" }
];
