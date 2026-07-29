import type { Metadata } from 'next';

import { BlogEditor } from '@/components/blogs/blog-editor';
import { BLOG_CATEGORIES } from '@/lib/constants';
import { emptyBlog } from '@/lib/blog-defaults';

export const metadata: Metadata = { title: 'New blog post' };

export default function NewBlogPage() {
  return <BlogEditor mode="create" initialValue={emptyBlog()} categories={BLOG_CATEGORIES} />;
}
