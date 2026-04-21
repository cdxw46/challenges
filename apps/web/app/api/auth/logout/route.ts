import { NextResponse } from "next/server";
import { logoutCurrentSession } from "@/lib/auth";

export async function POST(request: Request) {
  await logoutCurrentSession();

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/cuenta", request.url));
  }

  return NextResponse.json({ ok: true });
}
