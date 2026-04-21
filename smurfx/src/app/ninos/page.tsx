import { ListingPage } from "@/components/listing-page";
export const metadata = { title: "Niños" };
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <ListingPage
      basePath="/ninos"
      baseQuery={{ gender: "ninos" }}
      title="Niños"
      breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Niños" }]}
    />
  );
}
