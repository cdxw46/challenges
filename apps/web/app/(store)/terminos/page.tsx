import { notFound } from "next/navigation";
import { StaticPage } from "@/components/store/static-page";
import { getStaticPage } from "@/lib/catalog";

export default async function TermsPage() {
  const page = await getStaticPage("terminos");
  if (!page) notFound();

  return <StaticPage title={page.title} body={page.body} />;
}
