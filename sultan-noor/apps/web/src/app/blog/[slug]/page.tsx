import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { BlogPost } from "@/lib/types";

async function getPost(slug: string) {
  try {
    return await apiFetch<BlogPost>(`/blog/${slug}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "مقاله یافت نشد | سلطان نور" };

  const description = post.excerpt ?? post.content.slice(0, 160);
  return {
    title: `${post.title} | وبلاگ سلطان نور`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    },
  };
}

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
