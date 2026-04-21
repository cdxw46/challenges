import { notFound } from "next/navigation";
import { CollectionPage } from "@/components/store/collection-page";
import { getCollectionDetailView } from "@/lib/catalog";

type CollectionRouteProps = {
  params: Promise<{ slug: string }>;
};

export default async function CollectionRoutePage({ params }: CollectionRouteProps) {
  const { slug } = await params;
  const collection = await getCollectionDetailView(slug);

  if (!collection) {
    notFound();
  }

  return <CollectionPage collection={collection} />;
}
