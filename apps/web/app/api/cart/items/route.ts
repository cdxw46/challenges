import { NextRequest, NextResponse } from "next/server";

import { addItemToCart, removeCartItem, updateCartItem } from "@/lib/cart";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const variantId = typeof payload.variantId === "string" ? payload.variantId : "";
  const quantity = typeof payload.quantity === "number" ? payload.quantity : 1;

  if (!variantId) {
    return NextResponse.json({ error: "variantId requerido" }, { status: 400 });
  }

  const cart = await addItemToCart(variantId, quantity);
  return NextResponse.json({ cart });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json();
  const itemId = typeof payload.itemId === "string" ? payload.itemId : "";
  const quantity = typeof payload.quantity === "number" ? payload.quantity : 1;

  if (!itemId) {
    return NextResponse.json({ error: "itemId requerido" }, { status: 400 });
  }

  const cart = await updateCartItem(itemId, quantity);
  return NextResponse.json({ cart });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ error: "itemId requerido" }, { status: 400 });
  }
  const cart = await removeCartItem(itemId);
  return NextResponse.json({ cart });
}
