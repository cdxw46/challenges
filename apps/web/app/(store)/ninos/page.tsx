import { ListingPage } from "@/components/store/listing-page";
import { getProductListingView } from "@/lib/catalog";

export default async function KidsPage() {
  const result = await getProductListingView({ category: "ninos" });

  return (
    <ListingPage
      title="Ninos"
      description="Rendimiento diario para ritmo, juego y confort duradero."
      breadcrumb={[
        { label: "Inicio", href: "/" },
        { label: "Ninos" },
      ]}
      result={result}
      activeFilters={{ category: "ninos" }}
      basePath="/ninos"
    />
  );
}
