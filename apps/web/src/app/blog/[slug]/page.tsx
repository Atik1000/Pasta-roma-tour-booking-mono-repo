import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Markdown, Thumbnail } from '@pasta/ui';
import { formatDate } from '@pasta/utils';
import { CalendarDays, Tag } from 'lucide-react';

import { BlogSidebar } from '@/components/blog/blog-sidebar';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { api, safely } from '@/lib/api';

type Params = Promise<{ slug: string }>;

/** Degrades to on-demand rendering when the API is unreachable at build time. */
export async function generateStaticParams() {
  const posts = await safely(api.blog.list({ limit: 100 }), null, 'blog.list (prerender)');
  return (posts?.data ?? []).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await safely(api.blog.bySlug(slug), null, 'blog.bySlug');

  if (!post) return { title: 'Article not found' };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await safely(api.blog.bySlug(slug), null, 'blog.bySlug');

  if (!post) notFound();

  return (
    <>
      <Navbar />

      <main id="main">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
          <article className="flex flex-col gap-6">
            <Thumbnail
              src={post.coverImage}
              alt={post.title}
              className="rounded-card aspect-[16/8] w-full"
            />

            {/* Read time was struck from the meta line. */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
              {post.publishedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  {formatDate(post.publishedAt)}
                </span>
              ) : null}
              {post.categories[0] ? (
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="size-4" aria-hidden />
                  {post.categories[0]}
                </span>
              ) : null}
            </div>

            <h1 className="font-display text-balance text-4xl font-semibold">{post.title}</h1>

            <p className="text-muted-foreground text-lg">{post.excerpt}</p>

            <Markdown content={post.content} />
            {/* Author bio box and the social share row were both struck. */}
          </article>

          <BlogSidebar />
        </div>
      </main>

      <Footer />
    </>
  );
}
