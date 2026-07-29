import type { Metadata } from 'next';

import { NewTourEditor } from '@/components/tours/tour-editor-loader';

export const metadata: Metadata = { title: 'New tour' };

export default function NewTourPage() {
  return <NewTourEditor />;
}
