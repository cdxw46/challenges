"use client";

import Image from "next/image";
import Link from "next/link";

type BlogListProps = {
  posts: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverImage: string | null;
    tags: string[];
    category?: { name: string } | null;
    author?: { firstName: string; lastName: string } | null;
  }>;
};

export function BlogList({ posts }: BlogListProps) {
  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Blog</span>
          <h1>Ideas, producto y cultura de movimiento.</h1>
          <p>Guias practicas, capas editoriales y pensamiento de rendimiento desde SMURFX.</p>
        </div>
      </section>

      <div className="collection-grid">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="collection-card">
            <div className="collection-media">
              <Image
                src={
                  post.coverImage ??
                  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80"
                }
                alt={post.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="collection-body">
              <span className="section-eyebrow">{post.category?.name ?? "Performance Journal"}</span>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <div className="muted text-sm">
                {post.author ? `${post.author.firstName} ${post.author.lastName}` : "SMURFX"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
