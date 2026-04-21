import { StaticPage } from "@/components/store/static-page";
import { getStaticPage } from "@/lib/catalog";

export default async function SizeGuidePage() {
  const page = await getStaticPage("guia-de-tallas");
  return (
    <StaticPage
      title={page?.title ?? "Guia de tallas"}
      body={
        page?.body ??
        "<p>Consulta equivalencias por silueta y actividad para elegir el ajuste ideal.</p>"
      }
    />
  );
}
