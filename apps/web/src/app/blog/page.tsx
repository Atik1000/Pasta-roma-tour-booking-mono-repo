import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, EmptyState, Thumbnail } from '@pasta/ui';
import { formatDate } from '@pasta/utils';

import { BlogSidebar } from '@/components/blog/blog-sidebar';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageHero } from '@/components/layout/page-hero';
import { api, safely } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Travel Blog',
  description:
    'Insider tips, travel guides, and inspiring stories to help you experience the best of Rome.',
  alternates: { canonical: '/blog' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const category = Array.isArray(params.category) ? params.category[0] : params.category;
  const { data: posts } = await safely(
    api.blog.list({ category, limit: 10 }),
    {
      data: [],
      meta: {
        page: 1,
        limit: 0,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    'blog.list',
  );

  return (
    <>
      {/* Floats over the page hero photograph. */}
      <Navbar overlay />

      <main id="main">
        <PageHero
          title="Travel Blog"
          description="Insider tips, travel guides, and inspiring stories to help you experience the best of Rome."
        />

        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
          <div className="flex flex-col gap-5">
            {posts.length === 0 ? (
              <Card>
                <EmptyState
                  title="No articles yet"
                  description="Try another category, or check back soon."
                  action={
                    <Link className="text-primary underline underline-offset-4" href="/blog">
                      View all articles
                    </Link>
                  }
                />
              </Card>
            ) : (
              posts.map((post) => (
                <article key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="rounded-card border-border bg-card shadow-card hover:shadow-elevated focus-visible:outline-ring group flex flex-col overflow-hidden border transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 sm:flex-row"
                  >
                    {/*
                      A ratio at every breakpoint, not `sm:aspect-auto`.

                      Auto left the image with no height at all to crop
                      against, so `object-cover` had nothing to do and a
                      portrait cover — which is what a phone photograph
                      uploaded through the admin panel is — rendered at its
                      full natural height and stretched the card to three
                      times the height of its own text.
                    */}
                    <Thumbnail
                      src={post.coverImage}
                      alt={post.title}
                      className="aspect-[16/10] w-full rounded-none sm:aspect-[4/3] sm:w-56"
                    />

                    {/* No FEATURED badge, no author byline, no read time — all struck. */}
                    <div className="flex flex-col gap-2 p-5">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {/*
                          Every category, not just the first. A post filed under
                          both "Food & Drink" and "Local Tips" used to show one
                          of them, which made the sidebar counts look wrong —
                          filtering by the hidden category returned a card that
                          appeared to belong to something else.
                        */}
                        {post.categories.length > 0 ? (
                          <span className="text-primary flex flex-wrap gap-x-2 gap-y-1 font-medium uppercase tracking-wide">
                            {post.categories.map((name) => (
                              <span key={name}>{name}</span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-primary font-medium uppercase tracking-wide">
                            Article
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {post.publishedAt ? formatDate(post.publishedAt) : null}
                        </span>
                      </div>

                      <h2 className="font-display group-hover:text-primary text-balance text-xl font-semibold">
                        {post.title}
                      </h2>

                      <p className="text-muted-foreground text-sm">{post.excerpt}</p>
                    </div>
                  </Link>
                </article>
              ))
            )}
          </div>

          <BlogSidebar activeCategory={category} />
        </div>
      </main>

      <Footer />
    </>
  );
}
