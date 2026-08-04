'use client';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  ErrorState,
  Markdown,
  Skeleton,
  StatusPill,
  Thumbnail,
} from '@pasta/ui';
import { formatDateTime, wordCount } from '@pasta/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Eye, Pencil, Tag } from 'lucide-react';

import { env } from '@/lib/env';
import { adminApi } from '@/lib/session';

/**
 * Read-only view of a post, as a reader would see it.
 *
 * This is what the Preview buttons open. They used to point straight at the
 * public site, which works only for a published post — on a draft the site has
 * nothing to serve and answers 404, so previewing the very posts most likely to
 * need previewing produced a missing page. Rendering the post here works
 * whatever its status, and the link out to the live article stays, enabled only
 * when there is a live article to open.
 *
 * The body goes through the same `Markdown` renderer the site uses, so this
 * agrees with the published page rather than approximating it.
 */
export function BlogDetails({ id }: { id: string }) {
  const blog = useQuery({
    queryKey: ['admin', 'blogs', id],
    queryFn: () => adminApi.admin.blog(id),
  });

  if (blog.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[320px]" />
        </div>
      </div>
    );
  }

  if (blog.isError || !blog.data) {
    return <ErrorState title="That post could not be loaded" onRetry={() => void blog.refetch()} />;
  }

  const post = blog.data;
  const isPublished = post.status === 'PUBLISHED';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild leadingIcon={<ArrowLeft aria-hidden />}>
            <Link href="/blogs">Back to Blogs</Link>
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Blog Details</h1>
          <p className="text-muted-foreground mt-1">
            A read-only preview of this post, exactly as it renders on the site.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leadingIcon={<Eye aria-hidden />}
            disabled={!isPublished}
            title={isPublished ? undefined : 'Only published posts exist on the site'}
            onClick={() =>
              window.open(`${env.NEXT_PUBLIC_SITE_URL}/blog/${post.slug}`, '_blank', 'noopener')
            }
          >
            View on Site
          </Button>
          <Button asChild leadingIcon={<Pencil aria-hidden />}>
            <Link href={`/blogs/${post.id}`}>Edit Post</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="flex flex-col gap-6 p-6">
            {/* The featured image leads, the same way it does on the article. */}
            <Thumbnail
              src={post.coverImage}
              alt={post.title}
              className="rounded-card aspect-[16/8] w-full"
            />

            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
              <StatusPill status={post.status} />
              {post.publishedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  {formatDateTime(post.publishedAt)}
                </span>
              ) : (
                <span>Not published yet</span>
              )}
              {post.categories.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="size-4" aria-hidden />
                  {post.categories.join(', ')}
                </span>
              ) : null}
            </div>

            <h2 className="text-3xl font-semibold tracking-tight">{post.title}</h2>

            <Markdown content={post.content} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Post Details</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <Detail label="Slug" value={`/blog/${post.slug}`} />
                <Detail
                  label="Categories"
                  value={post.categories.length > 0 ? post.categories.join(', ') : '—'}
                />
                <Detail label="Word count" value={String(wordCount(post.content))} />
                <Detail label="Created" value={formatDateTime(post.createdAt)} />
                <Detail label="Last updated" value={formatDateTime(post.updatedAt)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">SEO Settings</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <Detail label="Meta title" value={post.metaTitle ?? '—'} />
                <Detail label="Meta description" value={post.metaDescription ?? '—'} />
                <Detail
                  label="Keywords"
                  value={post.keywords.length > 0 ? post.keywords.join(', ') : '—'}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
