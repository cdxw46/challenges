"use client";
import { useEffect, useState } from "react";

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    if (!localStorage.getItem("smurfx_cookies")) setShow(true);
  }, []);

  function save(level: "all" | "essential" | "custom") {
    const value =
      level === "all"
        ? { essential: true, analytics: true, marketing: true }
        : level === "essential"
          ? { essential: true, analytics: false, marketing: false }
          : { essential: true, ...prefs };
    localStorage.setItem("smurfx_cookies", JSON.stringify(value));
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-3xl rounded-2xl border border-ink/10 bg-white/95 p-5 shadow-2xl backdrop-blur md:left-6 md:right-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-ink/80">
          Usamos cookies para mejorar tu experiencia, analizar el tráfico y personalizar contenido.
          Puedes elegir qué tipos aceptas.
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={prefs.analytics}
              onChange={(e) => setPrefs((p) => ({ ...p, analytics: e.target.checked }))}
            />
            Analíticas
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={prefs.marketing}
              onChange={(e) => setPrefs((p) => ({ ...p, marketing: e.target.checked }))}
            />
            Marketing
          </label>
          <button onClick={() => save("essential")} className="btn-ghost text-xs">
            Solo esenciales
          </button>
          <button onClick={() => save("custom")} className="btn-secondary text-xs">
            Guardar
          </button>
          <button onClick={() => save("all")} className="btn-primary text-xs">
            Aceptar todo
          </button>
        </div>
      </div>
    </div>
  );
}
