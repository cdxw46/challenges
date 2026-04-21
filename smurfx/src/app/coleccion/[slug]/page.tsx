import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ListingPage } from "@/components/listing-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const c = await prisma.collection.findUnique({ where: { slug: params.slug } });
  return { title: c?.name || "Colección" };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const collection = await prisma.collection.findUnique({ where: { slug: params.slug } });
  if (!collection) notFound();
  return (
    <>
      <section
        className="relative isolate flex min-h-[50vh] items-end overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg,#1f1c5c,#534AB7)" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="container-x relative z-10 py-16">
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-smurf-100">Colección</div>
          <h1 className="mt-2 h-display text-5xl md:text-7xl">{collection.name}</h1>
          <p className="mt-4 max-w-2xl text-white/85">{collection.description}</p>
        </div>
      </section>
      {collection.story && (
        <section className="container-x prose prose-neutral max-w-4xl py-12">
          <p>{collection.story}</p>
        </section>
      )}
      <ListingPage
        basePath={`/coleccion/${params.slug}`}
        baseQuery={{ collection: params.slug }}
        title="Productos de la colección"
        breadcrumb={[
          { label: "Inicio", href: "/" },
          { label: "Colecciones", href: "/coleccion/blue-revolution" },
          { label: collection.name }
        ]}
      />
    </>
  );
}
