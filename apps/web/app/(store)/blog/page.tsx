import { BlogList } from "@/components/store/blog-list";
import { getBlogPosts } from "@/lib/catalog";

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return <BlogList posts={posts} />;
}
