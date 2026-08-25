"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { BlogPost } from "@/lib/types";

export default function LatestBlogPosts({ posts }: { posts: BlogPost[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid gap-4 sm:grid-cols-3"
    >
      {posts.map((post) => (
        <motion.div key={post.id} variants={fadeUp}>
          <Link
            href={`/blog/${post.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-2xl surface-card transition-shadow duration-300 hover:glow-shadow"
          >
            <div className="aspect-[16/10] w-full overflow-hidden bg-surface-2">
              {post.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-foreground/25">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 5h16v14H4V5Zm3 4h10M7 12h10M7 15h6" strokeLinecap="round" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="line-clamp-2 text-sm font-bold leading-6 transition-colors group-hover:text-brand">{post.title}</h3>
              {post.excerpt && <p className="line-clamp-2 text-xs text-muted">{post.excerpt}</p>}
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
