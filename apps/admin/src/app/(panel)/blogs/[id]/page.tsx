import type { Metadata } from 'next';

import { BlogEditor } from '@/components/blogs/blog-editor';
import { BLOG_CATEGORIES } from '@/lib/constants';
import { loadBlog } from '@/lib/blog-defaults';

export const metadata: Metadata = { title: 'Edit blog post' };

type Params = Promise<{ id: string }>;

export default async function EditBlogPage({ params }: { params: Params }) {
  const { id } = await params;

  return <BlogEditor mode="edit" initialValue={loadBlog(id)} categories={BLOG_CATEGORIES} />;
}
