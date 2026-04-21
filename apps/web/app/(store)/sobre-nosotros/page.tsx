import { notFound } from "next/navigation";
import { StaticPage } from "@/components/store/static-page";
import { getStaticPage } from "@/lib/catalog";

export default async function AboutPage() {
  const page = await getStaticPage("sobre-nosotros");
  if (!page) notFound();
  return <StaticPage title={page.title} body={page.body} />;
}
