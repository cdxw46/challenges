import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string, size: string, color: string) => void;
  updateQuantity: (id: string, size: string, color: string, quantity: number) => void;
  clearCart: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.id === item.id && i.size === item.size && i.color === item.color
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + item.quantity } : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },
      removeItem: (id, size, color) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.id === id && i.size === size && i.color === color)
          ),
        }));
      },
      updateQuantity: (id, size, color, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id && i.size === size && i.color === color ? { ...i, quantity } : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      total: () => {
        const { items } = get();
        return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      },
      itemCount: () => {
        const { items } = get();
        return items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: 'smurfx-cart',
    }
  )
);
