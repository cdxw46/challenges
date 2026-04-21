import { NextResponse } from "next/server";
import { getCartView } from "@/lib/cart";

export async function GET() {
  const cart = await getCartView();
  return NextResponse.json({ cart });
}
