"use client";
import { useEffect, useState } from "react";

const MESSAGES = [
  "Envío gratis en compras superiores a 50€",
  "Devoluciones gratuitas hasta 30 días",
  "Únete a SmurfX Members y gana puntos en cada compra",
  "Nueva colección Blue Revolution disponible"
];

export function AnnouncementBar() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % MESSAGES.length), 4500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-ink text-white">
      <div className="container-x flex h-9 items-center justify-center overflow-hidden text-xs font-medium tracking-wider">
        <div key={i} className="animate-fade-up text-center uppercase">
          {MESSAGES[i]}
        </div>
      </div>
    </div>
  );
}
