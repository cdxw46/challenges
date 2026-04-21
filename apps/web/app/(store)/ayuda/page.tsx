import { StaticPage } from "@/components/store/static-page";
import { getStaticPage } from "@/lib/catalog";

export default async function HelpPage() {
  const page = await getStaticPage("ayuda");

  return (
    <StaticPage
      title={page?.title ?? "Ayuda"}
      body={page?.body ?? "<p>Encuentra respuestas sobre pedidos, members, tallas y pagos.</p>"}
    />
  );
}
