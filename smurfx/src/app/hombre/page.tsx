import { ListingPage } from "@/components/listing-page";

export const metadata = { title: "Hombre" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ListingPage
      basePath="/hombre"
      baseQuery={{ gender: "hombre" }}
      title="Hombre"
      breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Hombre" }]}
    />
  );
}
