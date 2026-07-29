'use client';

import { ErrorState, Skeleton } from '@pasta/ui';
import type { AdminBlogDetail } from '@pasta/api-client';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/session';
import { emptyBlog } from '@/lib/blog-defaults';

import { BlogEditor, type BlogEditorValue } from './blog-editor';

function toEditorValue(blog: AdminBlogDetail): BlogEditorValue {
  return {
    id: blog.id,
    title: blog.title,
    slug: blog.slug,
    coverImage: blog.coverImage,
    content: blog.content,
    status: blog.status,
    categories: blog.categories,
    metaTitle: blog.metaTitle ?? '',
    metaDescription: blog.metaDescription ?? '',
    // The form edits keywords as one comma-separated line.
    keywords: blog.keywords.join(', '),
  };
}

function useCategoryNames() {
  const query = useQuery({
    queryKey: ['admin', 'blog-categories'],
    queryFn: () => adminApi.admin.blogCategories(),
  });

  return (query.data ?? []).map((entry) => entry.name);
}

export function NewBlogEditor() {
  const categories = useCategoryNames();

  return <BlogEditor mode="create" initialValue={emptyBlog()} categories={categories} />;
}

export function EditBlogEditor({ id }: { id: string }) {
  const categories = useCategoryNames();

  const blog = useQuery({
    queryKey: ['admin', 'blogs', id],
    queryFn: () => adminApi.admin.blog(id),
  });

  if (blog.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    );
  }

  if (blog.isError || !blog.data) {
    return <ErrorState title="That post could not be loaded" onRetry={() => void blog.refetch()} />;
  }

  return (
    <BlogEditor
      mode="edit"
      key={blog.data.id}
      initialValue={toEditorValue(blog.data)}
      categories={categories}
    />
  );
}
