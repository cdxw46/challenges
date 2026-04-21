import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function StaticPage({ slug }: { slug: string }) {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();
  return (
    <article className="container-x py-12">
      <h1 className="h-display text-4xl md:text-5xl">{page.title}</h1>
      <div
        className="prose prose-neutral mt-8 max-w-3xl"
        dangerouslySetInnerHTML={{ __html: page.body }}
      />
    </article>
  );
}
