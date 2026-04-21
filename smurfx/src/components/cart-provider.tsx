"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type CartLine = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  stock: number;
  quantity: number;
  unit: number;
  lineTotal: number;
};
export type CartSummary = {
  items: CartLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  shippingId: string;
  tax: number;
  total: number;
  couponCode: string | null;
  itemCount: number;
};

const empty: CartSummary = {
  items: [],
  subtotal: 0,
  discount: 0,
  shipping: 0,
  shippingId: "standard",
  tax: 0,
  total: 0,
  couponCode: null,
  itemCount: 0
};

type Ctx = {
  cart: CartSummary;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (variantId: string, qty?: number) => Promise<boolean>;
  update: (itemId: string, qty: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message?: string }>;
  clearCoupon: () => Promise<void>;
  setShipping: (id: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  toast: (msg: string) => void;
};

const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartSummary>(empty);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shippingId, setShippingId] = useState("standard");

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/cart?shipping=${shippingId}`, { cache: "no-store" });
    if (r.ok) setCart(await r.json());
  }, [shippingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toast = useCallback((msg: string) => {
    window.dispatchEvent(new CustomEvent("smurfx:toast", { detail: msg }));
  }, []);

  const add = useCallback(
    async (variantId: string, qty = 1) => {
      setLoading(true);
      try {
        const r = await fetch("/api/cart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variantId, quantity: qty })
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          toast(j.error || "No se pudo añadir");
          return false;
        }
        await refresh();
        toast("Añadido al carrito");
        setDrawerOpen(true);
        return true;
      } finally {
        setLoading(false);
      }
    },
    [refresh, toast]
  );

  const update = useCallback(
    async (itemId: string, qty: number) => {
      await fetch("/api/cart", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, quantity: qty })
      });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (itemId: string) => {
      await fetch(`/api/cart?itemId=${itemId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      const r = await fetch("/api/cart/coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code })
      });
      const j = await r.json();
      if (r.ok) {
        toast("Cupón aplicado");
        await refresh();
        return { ok: true };
      }
      return { ok: false, message: j.error };
    },
    [refresh, toast]
  );

  const clearCoupon = useCallback(async () => {
    await fetch("/api/cart/coupon", { method: "DELETE" });
    await refresh();
  }, [refresh]);

  const setShipping = useCallback((id: string) => {
    setShippingId(id);
  }, []);

  const value = useMemo(
    () => ({
      cart,
      loading,
      refresh,
      add,
      update,
      remove,
      applyCoupon,
      clearCoupon,
      setShipping,
      drawerOpen,
      setDrawerOpen,
      toast
    }),
    [cart, loading, refresh, add, update, remove, applyCoupon, clearCoupon, setShipping, drawerOpen, toast]
  );

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
