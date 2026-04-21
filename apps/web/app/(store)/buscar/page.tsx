import { ListingPage } from "@/components/store/listing-page";
import { getProductListingView } from "@/lib/catalog";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const activity = typeof params.activity === "string" ? params.activity : undefined;
  const line = typeof params.line === "string" ? params.line : undefined;
  const sort = typeof params.sort === "string" ? params.sort : undefined;
  const min = typeof params.min === "string" ? Number(params.min) : undefined;
  const max = typeof params.max === "string" ? Number(params.max) : undefined;

  const result = await getProductListingView({
    q,
    activity,
    line,
    sort: sort as
      | "relevance"
      | "newest"
      | "price-asc"
      | "price-desc"
      | "top-rated"
      | undefined,
    priceMin: Number.isFinite(min) ? min : undefined,
    priceMax: Number.isFinite(max) ? max : undefined,
  });

  return (
    <ListingPage
      title={q ? `Resultados para "${q}"` : "Buscar en SMURFX"}
      description="Busqueda full-text por nombre, descripcion, SKU y etiquetas."
      breadcrumb={[
        { label: "Inicio", href: "/" },
        { label: "Buscar" },
      ]}
      result={result}
      activeFilters={{
        q,
        activity,
        line,
        sort,
      }}
      basePath="/buscar"
    />
  );
}
