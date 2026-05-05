"use client";
import { useState } from "react";

const STATUSES = ["pending", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"];

export function OrderAdminControls({
  order
}: {
  order: { id: string; status: string; trackingCarrier?: string | null; trackingNumber?: string | null };
}) {
  const [status, setStatus] = useState(order.status);
  const [carrier, setCarrier] = useState(order.trackingCarrier || "");
  const [tracking, setTracking] = useState(order.trackingNumber || "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        <label className="label-base">Estado</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-base">
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-base">Carrier</label>
          <input className="input-base" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </div>
        <div>
          <label className="label-base">Tracking</label>
          <input className="input-base" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
      </div>
      <button
        onClick={async () => {
          const r = await fetch(`/api/admin/orders/${order.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status, trackingCarrier: carrier, trackingNumber: tracking })
          });
          setMsg(r.ok ? "Guardado" : "Error");
          if (r.ok) location.reload();
        }}
        className="btn-primary w-full"
      >
        Guardar
      </button>
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}
