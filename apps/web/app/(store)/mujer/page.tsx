import { ListingPage } from "@/components/store/listing-page";
import { getProductListingView } from "@/lib/catalog";

export default async function MujerPage() {
  const result = await getProductListingView({ gender: "Mujer", category: "mujer" });

  return (
    <ListingPage
      title="Mujer"
      description="Siluetas y apparel para performance, entrenamiento y estilo premium."
      breadcrumb={[
        { label: "Inicio", href: "/" },
        { label: "Mujer" },
      ]}
      result={result}
      activeFilters={{ gender: "Mujer" }}
      basePath="/mujer"
    />
  );
}
