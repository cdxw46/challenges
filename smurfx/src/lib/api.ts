import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json<T>(data: T, init?: number | ResponseInit) {
  if (typeof init === "number") return NextResponse.json(data, { status: init });
  return NextResponse.json(data, init);
}

export function error(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handle(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (e: any) {
      if (e instanceof Response) return e;
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: e.flatten() },
          { status: 400 }
        );
      }
      console.error("API error:", e);
      return NextResponse.json(
        { error: e?.message || "Internal server error" },
        { status: 500 }
      );
    }
  };
}

const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) return { ok: false, remaining: 0 };
  b.count++;
  return { ok: true, remaining: limit - b.count };
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
