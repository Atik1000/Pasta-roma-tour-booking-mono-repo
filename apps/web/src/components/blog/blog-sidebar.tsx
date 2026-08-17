import Link from 'next/link';

import { Button, Card, CardContent, Input } from '@pasta/ui';
import { Compass, Landmark, Newspaper, Search, UtensilsCrossed } from 'lucide-react';

import { api, safely } from '@/lib/api';

const CATEGORY_ICONS: Record<string, typeof Compass> = {
  'travel-guide': Compass,
  attractions: Landmark,
  'food-and-drink': UtensilsCrossed,
  'local-tips': Compass,
  'news-and-updates': Newspaper,
};

/**
 * Blog sidebar: search and categories only.
 *
 * The "Popular Posts" and "Subscribe to Our Newsletter" widgets that appeared
 * here were both struck from the design.
 */
export async function BlogSidebar({
  activeCategory,
  query,
}: {
  activeCategory?: string;
  query?: string;
}) {
  /**
   * The total comes from the listing's own pagination rather than by summing
   * the categories: an article filed under three of them counts three times,
   * and three of the articles on this blog are filed under none at all, so the
   * sum never did agree with the number of articles on the page.
   */
  const [categories, all] = await Promise.all([
    safely(api.blog.categories(), [], 'blog.categories'),
    safely(api.blog.list({ limit: 1 }), null, 'blog.list (total)'),
  ]);

  const total = all?.meta.total ?? 0;
  const showingAll = !activeCategory;

  return (
    <aside className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">Search Articles</h2>
          {/* A plain GET form, so the search survives a reload and can be
              shared as a link. The category rides along in a hidden field —
              searching used to silently drop whichever one was selected. */}
          <form action="/blog" role="search" className="flex flex-col gap-3">
            {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
            <label htmlFor="blog-search" className="sr-only">
              Search the blog
            </label>
            <Input
              id="blog-search"
              name="q"
              type="search"
              defaultValue={query ?? ''}
              placeholder="Search blog..."
              leadingIcon={<Search aria-hidden />}
            />
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">Categories</h2>
          <ul className="flex flex-col">
            {/* Anchors the list: without it the counts below add up to more
                than the blog holds and there is no way back to everything. */}
            <li>
              <Link
                href={query ? `/blog?q=${encodeURIComponent(query)}` : '/blog'}
                aria-current={showingAll ? 'true' : undefined}
                className="rounded-field hover:bg-muted flex items-center justify-between gap-3 px-2 py-2.5 text-sm transition-colors"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Newspaper className="text-primary size-4" aria-hidden />
                  <span className={showingAll ? 'text-primary font-medium' : undefined}>
                    All Articles
                  </span>
                </span>
                <span className="text-muted-foreground tabular-nums">{total}</span>
              </Link>
            </li>

            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.slug] ?? Compass;
              const isActive = activeCategory === category.name;

              // Toggling a category keeps whatever was searched for, so the two
              // filters compose instead of cancelling each other out.
              const params = new URLSearchParams();
              if (!isActive) params.set('category', category.name);
              if (query) params.set('q', query);
              const href = params.size > 0 ? `/blog?${params.toString()}` : '/blog';

              return (
                <li key={category.slug}>
                  <Link
                    href={href}
                    aria-current={isActive ? 'true' : undefined}
                    className="rounded-field hover:bg-muted flex items-center justify-between gap-3 px-2 py-2.5 text-sm transition-colors"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <Icon className="text-primary size-4" aria-hidden />
                      <span className={isActive ? 'text-primary font-medium' : undefined}>
                        {category.name}
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">{category.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}
