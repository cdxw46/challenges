import { ListingPage } from "@/components/listing-page";
export const metadata = { title: "Sale" };
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <ListingPage
      basePath="/sale"
      baseQuery={{ sale: "1" }}
      title="Sale"
      breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Sale" }]}
    />
  );
}
