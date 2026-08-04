import type { Metadata } from 'next';

import { BlogDetails } from '@/components/blogs/blog-details';

export const metadata: Metadata = { title: 'Blog details' };

type Params = Promise<{ id: string }>;

export default async function BlogDetailsPage({ params }: { params: Params }) {
  const { id } = await params;

  return <BlogDetails id={id} />;
}
