import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { AnnouncementBar } from "@/components/announcement-bar";
import { CartProvider } from "@/components/cart-provider";
import { ToastHost } from "@/components/toast";
import { CookieBanner } from "@/components/cookie-banner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "SMURFX — Move in blue",
    template: "%s | SMURFX"
  },
  description:
    "SMURFX. Zapatillas y ropa deportiva diseñadas para moverte. SmurfAir, SmurfForce, SmurfRun, SmurfGlide, SmurfTrail.",
  openGraph: {
    title: "SMURFX — Move in blue",
    description:
      "Zapatillas y ropa deportiva. Descubre las líneas SmurfAir, SmurfForce, SmurfRun, SmurfGlide, SmurfTrail.",
    type: "website",
    locale: "es_ES",
    siteName: "SMURFX"
  },
  twitter: { card: "summary_large_image", title: "SMURFX — Move in blue" },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#534AB7",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{try{const t=localStorage.getItem('smurfx_theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');}catch{}})();"
          }}
        />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-smurf-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>
        <CartProvider>
          <AnnouncementBar />
          <Navbar />
          <main id="contenido" className="min-h-[60vh]">
            {children}
          </main>
          <Footer />
          <ToastHost />
          <CookieBanner />
        </CartProvider>
      </body>
    </html>
  );
}
