import type { Metadata } from 'next';

import { EditBlogEditor } from '@/components/blogs/blog-editor-loader';

export const metadata: Metadata = { title: 'Edit blog post' };

type Params = Promise<{ id: string }>;

export default async function EditBlogPage({ params }: { params: Params }) {
  const { id } = await params;

  return <EditBlogEditor id={id} />;
}
