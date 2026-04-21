import { notFound } from "next/navigation";
import ProductPageClient from "./ProductPageClient";

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  
  let product = null;
  try {
    const res = await fetch(`http://localhost:4000/api/v1/products/${slug}`, { cache: 'no-store' });
    if (res.ok) {
      product = await res.json();
    }
  } catch (error) {
    console.error("Failed to fetch product:", error);
  }

  if (!product) {
    notFound();
  }

  return <ProductPageClient product={product} />;
}
