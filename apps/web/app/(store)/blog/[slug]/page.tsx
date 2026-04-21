import { notFound } from "next/navigation";
import Image from "next/image";

import { getBlogPostBySlug } from "@/lib/catalog";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="page-shell page-stack">
      <article className="article-shell">
        <div className="article-hero">
          {post.coverImage ? (
            <div className="article-cover">
              <Image src={post.coverImage} alt={post.title} fill className="object-cover" />
            </div>
          ) : null}
          <div className="article-copy">
            <span className="section-eyebrow">{post.category?.name ?? "Journal"}</span>
            <h1>{post.title}</h1>
            <p>{post.excerpt}</p>
          </div>
        </div>
        <div
          className="article-body card"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </article>
    </div>
  );
}
