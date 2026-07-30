'use client';

import Link from 'next/link';

import { Button, ErrorState, Skeleton, StatCard } from '@pasta/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileText, Pencil, Plus } from 'lucide-react';

import { BlogsTable } from '@/components/blogs/blogs-table';
import { PageHeader } from '@/components/layout/admin-shell';
import { adminApi } from '@/lib/session';

export default function BlogsPage() {
  const stats = useQuery({
    queryKey: ['admin', 'blogs', 'stats'],
    queryFn: () => adminApi.admin.blogStats(),
  });
  const categories = useQuery({
    queryKey: ['blog', 'categories'],
    queryFn: () => adminApi.blog.categories(),
  });

  return (
    <>
      {/* The "Blog Categories" button was struck from the design, so the only
          action here is creating a post. */}
      <PageHeader
        title="Blogs"
        description="Manage all blog posts, publish content, and keep your travel stories updated."
        actions={
          <Button asChild leadingIcon={<Plus aria-hidden />}>
            <Link href="/blogs/new">Add New Blog</Link>
          </Button>
        }
      />

      {/* Three cards, not four: the "Categories" stat was struck. */}
      <section aria-label="Blog totals" className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.isLoading ? (
          Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24" />)
        ) : stats.isError ? (
          <div className="sm:col-span-3">
            <ErrorState onRetry={() => void stats.refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Total Blogs"
              value={stats.data?.total ?? 0}
              hint="All blog posts"
              icon={<FileText aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Published Blogs"
              value={stats.data?.published ?? 0}
              hint="Live and visible"
              icon={<CheckCircle2 aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Draft Blogs"
              value={stats.data?.draft ?? 0}
              hint="Not yet published"
              icon={<Pencil aria-hidden />}
              tone="warning"
            />
          </>
        )}
      </section>

      <BlogsTable categories={(categories.data ?? []).map((entry) => entry.name)} />
    </>
  );
}
