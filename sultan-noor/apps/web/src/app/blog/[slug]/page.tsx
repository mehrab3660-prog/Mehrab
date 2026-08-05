import { apiFetch } from "@/lib/api";
import { BlogPost } from "@/lib/types";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await apiFetch<BlogPost>(`/blog/${slug}`);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{post.title}</h1>
      {post.author?.fullName && <p className="mt-1 text-sm text-foreground/50">نویسنده: {post.author.fullName}</p>}
      <div className="mt-6 whitespace-pre-line leading-8 text-foreground/80">{post.content}</div>
    </article>
  );
}
