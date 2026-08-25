import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { BlogPost } from "@/lib/types";

export default async function BlogPage() {
  let posts: BlogPost[] = [];
  try {
    posts = await apiFetch<BlogPost[]>("/blog");
  } catch {
    posts = [];
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">وبلاگ آموزشی سلطان نور</h1>
      {posts.length === 0 ? (
        <p className="text-foreground/60">هنوز مقاله‌ای منتشر نشده است.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="block rounded-lg border border-border-color p-4 hover:bg-surface"
            >
              <h2 className="text-lg font-bold">{post.title}</h2>
              {post.excerpt && <p className="mt-1 text-sm text-foreground/60">{post.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
