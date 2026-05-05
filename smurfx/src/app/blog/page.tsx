import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const revalidate = 120;
export const metadata = { title: "Blog" };

export default async function Page() {
  const posts = await prisma.blogPost.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    include: { category: true }
  });
  return (
    <div className="container-x py-12">
      <h1 className="h-display text-4xl">Blog</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {posts.map((p) => (
          <Link key={p.id} href={`/blog/${p.slug}`} className="block overflow-hidden rounded-2xl border border-ink/10 bg-white card-hover">
            <div
              className="aspect-[16/10]"
              style={{ background: "linear-gradient(135deg,#534AB7,#0a0a0a)" }}
            />
            <div className="p-5">
              {p.category && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-smurf-500">{p.category.name}</div>
              )}
              <h2 className="mt-1 text-lg font-extrabold leading-tight">{p.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-ink/70">{p.excerpt}</p>
              <div className="mt-3 text-xs text-ink/50">{p.publishedAt && formatDate(p.publishedAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
