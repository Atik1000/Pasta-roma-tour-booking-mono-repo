import type { Metadata } from 'next';

import { NewBlogEditor } from '@/components/blogs/blog-editor-loader';

export const metadata: Metadata = { title: 'New blog post' };

export default function NewBlogPage() {
  return <NewBlogEditor />;
}
