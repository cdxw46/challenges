import type { Metadata } from "next";

import { PwaRegister } from "@/components/pwa/register";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://smurfx.local"),
  title: {
    default: "SMURFX — Move in blue",
    template: "%s | SMURFX",
  },
  description: "Tienda online premium de zapatillas y ropa deportiva con identidad minimalista y enfoque rendimiento.",
  applicationName: "SMURFX",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
