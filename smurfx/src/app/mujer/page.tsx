import { ListingPage } from "@/components/listing-page";
export const metadata = { title: "Mujer" };
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <ListingPage
      basePath="/mujer"
      baseQuery={{ gender: "mujer" }}
      title="Mujer"
      breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Mujer" }]}
    />
  );
}
