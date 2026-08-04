'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  FilterPanel,
  FilterRange,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  TableFooter,
  type ColumnDef,
  useToast,
} from '@pasta/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@pasta/utils';
import { Eye, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';

import type { AdminBlog } from '@pasta/api-client';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { adminApi } from '@/lib/session';

/** The advanced filters behind the Filters button. */
interface Advanced {
  from: string;
  to: string;
}

const NO_ADVANCED: Advanced = { from: '', to: '' };

export function BlogsTable({ categories }: { categories: string[] }) {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');
  const [advanced, setAdvanced] = React.useState<Advanced>(NO_ADVANCED);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);

  const debouncedSearch = useDebouncedValue(search, 300);

  /**
   * Any narrowing change returns to page 1. Category and Status used to leave
   * the page alone, so switching them while on page 3 of a 4-page list often
   * landed on an empty page that looked like "no posts match".
   */
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  const activeAdvanced = Object.values(advanced).filter((entry) => entry !== '').length;

  const query = useQuery({
    queryKey: ['admin', 'blogs', { debouncedSearch, category, status, advanced, page, perPage }],
    queryFn: () =>
      adminApi.admin.blogs({
        search: debouncedSearch.trim() || undefined,
        category: category === 'ALL' ? undefined : category,
        status,
        from: advanced.from || undefined,
        to: advanced.to || undefined,
        page,
        limit: perPage,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const toast = useToast();

  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = React.useState<AdminBlog | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.admin.deleteBlog(id),
    onSuccess: async () => {
      toast.success('Post deleted', `${pendingDelete?.title ?? 'It'} is no longer listed.`);
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blogs'] });
    },
  });

  const columns = React.useMemo<ColumnDef<AdminBlog, unknown>[]>(
    () => [
      {
        id: 'blog',
        header: 'Blog',
        // No thumbnail: the cover photo is the article's, not something an
        // operator scans a list by.
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block font-medium">{row.original.title}</span>
            <span className="text-muted-foreground block max-w-md truncate text-xs">
              {row.original.excerpt}
            </span>
          </span>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        // A post can sit in several categories, and every one of them shows.
        cell: ({ row }) =>
          row.original.categories.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {row.original.categories.map((entry) => (
                <Badge key={entry} tone="neutral">
                  {entry}
                </Badge>
              ))}
            </span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
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
            {/* The details screen, not the live article: a draft has no page on
                the site, so linking straight out answered 404 for exactly the
                posts most in need of a look. The live link lives in there. */}
            <Button
              variant="subtle"
              size="icon"
              asChild
              aria-label={`View details for ${row.original.title}`}
            >
              <Link href={`/blogs/${row.original.id}/preview`}>
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
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const hasFilters = search !== '' || category !== 'ALL' || status !== 'ALL' || activeAdvanced > 0;

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
              onChange={(event) => narrow(() => setSearch(event.target.value))}
              placeholder="Search by blog title or slug..."
              leadingIcon={<Search aria-hidden />}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="blog-category" className="text-muted-foreground text-xs">
              Category
            </label>
            <Select value={category} onValueChange={(next) => narrow(() => setCategory(next))}>
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
            <Select value={status} onValueChange={(next) => narrow(() => setStatus(next))}>
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

          <FilterPanel
            activeCount={activeAdvanced}
            onClear={() => narrow(() => setAdvanced(NO_ADVANCED))}
          >
            <FilterRange legend="Published between">
              <Input
                type="date"
                aria-label="Published on or after"
                value={advanced.from}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, from: event.target.value }))
                }
              />
              <Input
                type="date"
                aria-label="Published on or before"
                value={advanced.to}
                onChange={(event) =>
                  narrow(() => setAdvanced({ ...advanced, to: event.target.value }))
                }
              />
            </FilterRange>
            <p className="text-muted-foreground text-xs">
              Drafts have no publish date, so a date range excludes them.
            </p>
          </FilterPanel>

          <Button
            variant="ghost"
            className="self-end"
            leadingIcon={<RotateCcw aria-hidden />}
            disabled={!hasFilters}
            onClick={() =>
              narrow(() => {
                setSearch('');
                setCategory('ALL');
                setStatus('ALL');
                setAdvanced(NO_ADVANCED);
              })
            }
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

      <TableFooter
        page={page}
        perPage={perPage}
        rowCount={rows.length}
        total={total}
        noun="entries"
        onPageChange={setPage}
        onPerPageChange={(next) => narrow(() => setPerPage(next))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open: boolean) => !open && setPendingDelete(null)}
        title="Delete this post?"
        description={
          pendingDelete ? `"${pendingDelete.title}" will be removed from the website.` : null
        }
        confirmLabel="Delete post"
        isPending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  );
}
