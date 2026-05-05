"use client";
import { useEffect, useState } from "react";

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, msg }]);
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3500);
    };
    window.addEventListener("smurfx:toast", handler as EventListener);
    return () => window.removeEventListener("smurfx:toast", handler as EventListener);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="pointer-events-auto animate-fade-up rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium shadow-xl"
        >
          {i.msg}
        </div>
      ))}
    </div>
  );
}
