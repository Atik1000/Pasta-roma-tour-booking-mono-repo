import Link from 'next/link';

import { Card, CardContent, Input } from '@pasta/ui';
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
export async function BlogSidebar({ activeCategory }: { activeCategory?: string }) {
  const categories = await safely(api.blog.categories(), [], 'blog.categories');

  return (
    <aside className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">Search Articles</h2>
          <form action="/blog" role="search">
            <label htmlFor="blog-search" className="sr-only">
              Search the blog
            </label>
            <Input
              id="blog-search"
              name="q"
              type="search"
              placeholder="Search blog..."
              leadingIcon={<Search aria-hidden />}
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-display mb-3 text-lg font-semibold">Categories</h2>
          <ul className="flex flex-col">
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.slug] ?? Compass;
              const isActive = activeCategory === category.name;

              return (
                <li key={category.slug}>
                  <Link
                    href={
                      isActive ? '/blog' : `/blog?category=${encodeURIComponent(category.name)}`
                    }
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
