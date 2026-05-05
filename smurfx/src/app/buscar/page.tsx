import { ListingPage } from "@/components/listing-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar" };

export default function Page({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q || "";
  return (
    <ListingPage
      basePath={`/buscar`}
      baseQuery={{ q }}
      title={q ? `Resultados para “${q}”` : "Buscar"}
      breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Buscar" }]}
    />
  );
}
