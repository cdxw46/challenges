import { StaticPage } from "@/components/store/static-page";
import { getStaticPage } from "@/lib/catalog";

export default async function SustainabilityPage() {
  const page = await getStaticPage("sostenibilidad");
  return <StaticPage title={page?.title ?? "Sostenibilidad"} body={page?.body ?? ""} />;
}
