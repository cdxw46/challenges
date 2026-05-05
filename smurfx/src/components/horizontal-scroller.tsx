"use client";
import { useRef } from "react";
import { Chevron } from "./icons";

export function HorizontalScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  function scroll(dir: number) {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: "smooth" });
  }
  return (
    <div className="relative">
      <div
        ref={ref}
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2"
      >
        {children}
      </div>
      <button
        onClick={() => scroll(-1)}
        aria-label="Anterior"
        className="absolute -left-3 top-1/3 hidden h-10 w-10 -translate-y-1/2 rotate-180 items-center justify-center rounded-full border border-ink/10 bg-white shadow-lg md:flex"
      >
        <Chevron />
      </button>
      <button
        onClick={() => scroll(1)}
        aria-label="Siguiente"
        className="absolute -right-3 top-1/3 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-ink/10 bg-white shadow-lg md:flex"
      >
        <Chevron />
      </button>
    </div>
  );
}
