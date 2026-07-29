'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Pagination } from '@pasta/ui';

/** Keeps the pager in the URL so a paged listing is shareable and server-rendered. */
export function ToursPagination({
  page,
  totalPages,
  className,
}: {
  page: number;
  totalPages: number;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      className={className}
      onPageChange={(next) => {
        const query = new URLSearchParams(params.toString());
        if (next <= 1) query.delete('page');
        else query.set('page', String(next));
        router.push(query.size > 0 ? `/tours?${query.toString()}` : '/tours');
      }}
    />
  );
}
