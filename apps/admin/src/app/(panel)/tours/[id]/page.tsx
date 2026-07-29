import type { Metadata } from 'next';

import { EditTourEditor } from '@/components/tours/tour-editor-loader';

export const metadata: Metadata = { title: 'Edit tour' };

type Params = Promise<{ id: string }>;

export default async function EditTourPage({ params }: { params: Params }) {
  const { id } = await params;

  return <EditTourEditor id={id} />;
}
