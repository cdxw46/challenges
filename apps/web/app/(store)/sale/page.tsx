import { getProductListingView } from "@/lib/catalog";
import { ListingPage } from "@/components/store/listing-page";

export default async function SalePage() {
  const result = await getProductListingView({ sale: true, limit: 24 });

  return (
    <ListingPage
      title="Sale"
      description="Descuentos seleccionados en siluetas y capas premium."
      breadcrumb={[
        { label: "Inicio", href: "/" },
        { label: "Sale" },
      ]}
      basePath="/sale"
      result={result}
      activeFilters={{ sale: true }}
    />
  );
}
