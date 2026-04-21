import { getProductListingView } from "@/lib/catalog";
import { ListingPage } from "@/components/store/listing-page";

export default async function HombrePage() {
  const result = await getProductListingView({ category: "hombre", gender: "Hombre" });
  return (
    <ListingPage
      title="Hombre"
      description="Running, training, lifestyle y trail para hombre."
      breadcrumb={[
        { label: "Inicio", href: "/" },
        { label: "Hombre" },
      ]}
      result={result}
      activeFilters={{ category: "hombre", gender: "Hombre" }}
      basePath="/hombre"
    />
  );
}
