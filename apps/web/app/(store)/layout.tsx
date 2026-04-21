import type { ReactNode } from "react";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { getCurrentUser } from "@/lib/auth";
import { getCartView } from "@/lib/cart";
import { getStoreShellView } from "@/lib/catalog";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [shell, cart, user] = await Promise.all([
    getStoreShellView(),
    getCartView(),
    getCurrentUser(),
  ]);

  return (
    <div className="store-root">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <AnnouncementBar items={shell.announcements} />
      <Navbar
        items={shell.menuItems}
        cartCount={cart.items.length}
        wishlistCount={user?.wishlists.length ?? 0}
      />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  );
}
