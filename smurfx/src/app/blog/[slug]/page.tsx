import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const revalidate = 120;
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await prisma.blogPost.findUnique({ where: { slug: params.slug } });
  return { title: p?.title || "Blog" };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const post = await prisma.blogPost.findUnique({
    where: { slug: params.slug },
    include: { category: true }
  });
  if (!post) notFound();
  return (
    <article className="container-x py-12">
      <a href="/blog" className="text-sm text-ink/60">← Volver al blog</a>
      <h1 className="h-display mt-3 text-4xl md:text-5xl">{post.title}</h1>
      <div className="mt-2 text-xs text-ink/55">
        {post.authorName} · {post.publishedAt && formatDate(post.publishedAt)}
      </div>
      <div
        className="mt-8 aspect-[16/7] rounded-3xl"
        style={{ background: "linear-gradient(135deg,#534AB7,#0a0a0a)" }}
      />
      <div
        className="prose prose-neutral mx-auto mt-10 max-w-3xl"
        dangerouslySetInnerHTML={{ __html: post.body }}
      />
    </article>
  );
}
