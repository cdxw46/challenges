import { getStaticPage } from "@/lib/catalog";
import { StaticPage } from "@/components/store/static-page";

export default async function ShippingReturnsPage() {
  const page = await getStaticPage("envios-devoluciones");
  return <StaticPage page={page} fallbackTitle="Envios y devoluciones" />;
}
