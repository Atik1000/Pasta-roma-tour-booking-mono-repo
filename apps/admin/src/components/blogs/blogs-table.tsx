'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  type ColumnDef,
} from '@pasta/ui';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '@pasta/utils';
import { Eye, Filter, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { AdminBlog } from '@pasta/api-client';

import { adminApi } from '@/lib/session';

export function BlogsTable({ categories }: { categories: string[] }) {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const perPage = 10;

  const query = useQuery({
    queryKey: ['admin', 'blogs', { search, category, status, page }],
    queryFn: () =>
      adminApi.admin.blogs({
        search: search.trim() || undefined,
        category: category === 'ALL' ? undefined : category,
        status,
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const columns = React.useMemo<ColumnDef<AdminBlog, unknown>[]>(
    () => [
      {
        id: 'blog',
        header: 'Blog',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span
              role="img"
              aria-label={row.original.title}
              className="rounded-field h-12 w-16 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
            />
            <span className="min-w-0">
              <span className="block font-medium">{row.original.title}</span>
              <span className="text-muted-foreground block max-w-md truncate text-xs">
                {row.original.excerpt}
              </span>
            </span>
          </div>
        ),
      },
      { id: 'category', header: 'Category', cell: ({ row }) => row.original.categories.join(', ') },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'publishedAt',
        header: 'Published On',
        cell: ({ row }) =>
          row.original.publishedAt ? (
            <span className="text-muted-foreground whitespace-nowrap text-sm">
              {formatDateTime(row.original.publishedAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap text-sm">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="subtle"
              size="icon"
              asChild
              aria-label={`Preview ${row.original.title}`}
            >
              <Link href={`/blogs/${row.original.id}`}>
                <Eye aria-hidden />
              </Link>
            </Button>
            <Button variant="subtle" size="icon" asChild aria-label={`Edit ${row.original.title}`}>
              <Link href={`/blogs/${row.original.id}`}>
                <Pencil aria-hidden />
              </Link>
            </Button>
            <Button
              variant="subtle"
              size="icon"
              aria-label={`Delete ${row.original.title}`}
              className="border-danger/30 text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const hasFilters = search !== '' || category !== 'ALL' || status !== 'ALL';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_13rem_13rem_auto_auto]">
          <div>
            <label htmlFor="blog-search" className="sr-only">
              Search blogs
            </label>
            <Input
              id="blog-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by blog title or slug..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="blog-category" className="text-muted-foreground text-xs">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="blog-category" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {categories.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="blog-status" className="text-muted-foreground text-xs">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="blog-status" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" className="self-end" leadingIcon={<Filter aria-hidden />}>
            Filters
          </Button>

          <Button
            variant="ghost"
            className="self-end"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() => {
              setSearch('');
              setCategory('ALL');
              setStatus('ALL');
            }}
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        emptyTitle="No blog posts match your filters"
        emptyDescription="Adjust the search or reset the filters to see every post."
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Showing {rows.length} of {total} entries
        </p>
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / perPage))}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
