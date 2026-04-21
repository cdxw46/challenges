import { notFound } from "next/navigation";
import { ProductDetailPage } from "@/components/store/product-detail-page";
import { getProductDetailView } from "@/lib/catalog";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductDetailView(slug);

  if (!product) notFound();

  return <ProductDetailPage product={product} />;
}
