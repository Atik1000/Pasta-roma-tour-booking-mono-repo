'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Badge,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@pasta/ui';
import { isApiClientError, type SaveBlogPayload } from '@pasta/api-client';
import { slugify, wordCount } from '@pasta/utils';
import { useMutation } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { adminApi } from '@/lib/session';

import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Save,
  Strikethrough,
  Underline,
  Upload,
  X,
} from 'lucide-react';

export interface BlogEditorValue {
  id?: string;
  title: string;
  slug: string;
  coverImage: string | null;
  content: string;
  status: 'PUBLISHED' | 'DRAFT';
  categories: string[];
  metaTitle: string;
  metaDescription: string;
  keywords: string;
}

/**
 * Blog create/edit.
 *
 * Two fields were struck from the design and are deliberately absent: the
 * Excerpt textarea, and the manual Publish Date — publishing is the status
 * alone, and `publishedAt` is stamped server-side on first publish.
 *
 * The content toolbar stays: only the *tour* form's rich-text toolbar was
 * struck. It writes Markdown, so the stored content has no HTML to sanitise.
 */
export function BlogEditor({
  initialValue,
  categories,
  mode,
}: {
  initialValue: BlogEditorValue;
  categories: string[];
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialValue);
  const [slugTouched, setSlugTouched] = React.useState(mode === 'edit');
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: SaveBlogPayload) =>
      value.id ? adminApi.admin.updateBlog(value.id, payload) : adminApi.admin.createBlog(payload),
    onSuccess: (result) => {
      setError(null);
      if (!value.id) router.replace(`/blogs/${result.id}`);
    },
    onError: (caught: unknown) => {
      setError(isApiClientError(caught) ? caught.message : 'Could not save. Please try again.');
    },
  });
  const contentRef = React.useRef<HTMLTextAreaElement>(null);

  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const [coverError, setCoverError] = React.useState<string | null>(null);

  const uploadCover = useMutation({
    mutationFn: (file: File) => adminApi.admin.uploadImage(file),
    onSuccess: (result) => {
      setCoverError(null);
      patch({ coverImage: result.url });
    },
    onError: (caught: unknown) => {
      setCoverError(
        isApiClientError(caught) ? caught.message : 'That upload failed. Please try again.',
      );
    },
  });

  function patch(changes: Partial<BlogEditorValue>) {
    setValue((current) => ({ ...current, ...changes }));
  }

  function setTitle(title: string) {
    // Until the slug is edited by hand it follows the title.
    patch(slugTouched ? { title } : { title, slug: slugify(title) });
  }

  /** Wraps or prefixes the current selection with Markdown syntax. */
  function applyFormat(before: string, after = '', blockPrefix?: string) {
    const textarea = contentRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value: text } = textarea;
    const selected = text.slice(selectionStart, selectionEnd);

    const replacement = blockPrefix
      ? selected
          .split('\n')
          .map((line) => `${blockPrefix}${line}`)
          .join('\n')
      : `${before}${selected}${after}`;

    const next = text.slice(0, selectionStart) + replacement + text.slice(selectionEnd);
    patch({ content: next });

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionStart + replacement.length);
    });
  }

  const TOOLBAR = [
    { icon: Bold, label: 'Bold', run: () => applyFormat('**', '**') },
    { icon: Italic, label: 'Italic', run: () => applyFormat('_', '_') },
    { icon: Underline, label: 'Underline', run: () => applyFormat('<u>', '</u>') },
    { icon: Strikethrough, label: 'Strikethrough', run: () => applyFormat('~~', '~~') },
    { icon: Heading2, label: 'Heading 2', run: () => applyFormat('', '', '## ') },
    { icon: Heading3, label: 'Heading 3', run: () => applyFormat('', '', '### ') },
    { icon: List, label: 'Bulleted list', run: () => applyFormat('', '', '- ') },
    { icon: ListOrdered, label: 'Numbered list', run: () => applyFormat('', '', '1. ') },
    { icon: Quote, label: 'Quote', run: () => applyFormat('', '', '> ') },
    { icon: Link2, label: 'Link', run: () => applyFormat('[', '](https://)') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild leadingIcon={<ArrowLeft aria-hidden />}>
            <Link href="/blogs">Back to Blogs</Link>
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {mode === 'create' ? 'New Blog Post' : 'Edit Blog Post'}
          </h1>
          <p className="text-muted-foreground mt-1">Update your blog post details and content.</p>
        </div>

        <div className="flex items-center gap-3">
          {/*
            Previews the post on the public site. A post that has never been
            saved has no URL to open, so the button says so rather than
            opening a 404.
          */}
          <Button
            variant="outline"
            leadingIcon={<Eye aria-hidden />}
            disabled={!value.id || !value.slug}
            title={value.id ? undefined : 'Save the post first'}
            onClick={() =>
              window.open(`${env.NEXT_PUBLIC_SITE_URL}/blog/${value.slug}`, '_blank', 'noopener')
            }
          >
            Preview
          </Button>
          <Button
            leadingIcon={<Save aria-hidden />}
            isLoading={save.isPending}
            onClick={() =>
              save.mutate({
                title: value.title,
                slug: value.slug || undefined,
                content: value.content,
                status: value.status,
                coverImage: value.coverImage ?? undefined,
                categories: value.categories,
                metaTitle: value.metaTitle || undefined,
                metaDescription: value.metaDescription || undefined,
                keywords: value.keywords
                  .split(',')
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
          >
            {save.isSuccess ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-soft text-danger-foreground rounded-card flex items-start gap-2.5 border px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-5 text-lg font-semibold">Basic Information</h2>

              <div className="flex flex-col gap-5">
                <FormField label="Title" required>
                  <Input value={value.title} onChange={(event) => setTitle(event.target.value)} />
                </FormField>

                <FormField
                  label="Slug"
                  required
                  hint={`This will be used in the URL: /blogs/${value.slug || 'your-post'}`}
                >
                  <Input
                    value={value.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      patch({ slug: slugify(event.target.value) });
                    }}
                  />
                </FormField>

                {/* The Excerpt field was struck from the design. */}

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Featured Image</span>
                  {coverError ? (
                    <p role="alert" className="text-danger-foreground text-sm">
                      {coverError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-start gap-4">
                    {value.coverImage ? (
                      <span className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={value.coverImage}
                          alt="Featured image"
                          className="rounded-field bg-muted block h-24 w-40 object-cover"
                        />
                        <button
                          type="button"
                          aria-label="Remove featured image"
                          onClick={() => patch({ coverImage: null })}
                          className="bg-cream-900/70 hover:bg-danger focus-visible:outline-ring absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    ) : null}

                    <button
                      type="button"
                      disabled={uploadCover.isPending}
                      onClick={() => coverInputRef.current?.click()}
                      className="rounded-field border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-ring flex h-24 flex-1 flex-col items-center justify-center gap-1.5 border border-dashed px-6 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                    >
                      <Upload className="size-5" aria-hidden />
                      {uploadCover.isPending ? 'Uploading…' : 'Upload Image'}
                      <span className="text-xs">Recommended 1200x630px · JPG, PNG or WebP</span>
                    </button>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="sr-only"
                      aria-label="Choose a featured image"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadCover.mutate(file);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <label htmlFor="blog-content" className="text-sm font-medium">
                Content <span className="text-danger">*</span>
              </label>

              <div className="rounded-field border-input mt-2 overflow-hidden border">
                <div
                  role="toolbar"
                  aria-label="Formatting"
                  aria-controls="blog-content"
                  className="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1.5"
                >
                  {TOOLBAR.map(({ icon: Icon, label, run }) => (
                    <Button
                      key={label}
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={label}
                      title={label}
                      onClick={run}
                    >
                      <Icon aria-hidden />
                    </Button>
                  ))}
                </div>

                <textarea
                  id="blog-content"
                  ref={contentRef}
                  rows={16}
                  value={value.content}
                  onChange={(event) => patch({ content: event.target.value })}
                  className="bg-card w-full resize-y px-4 py-3 font-mono text-sm leading-relaxed outline-none"
                />

                <div className="border-border bg-muted/30 text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-xs">
                  <span>Word count: {wordCount(value.content)}</span>
                  <span>Markdown supported</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-5 text-lg font-semibold">Publish Settings</h2>

              <FormField label="Status" required>
                <Select
                  value={value.status}
                  onValueChange={(next) => patch({ status: next as BlogEditorValue['status'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {/* The manual Publish Date field was struck; the publish time is
                  stamped server-side when a post is first published. */}
              <p className="text-muted-foreground mt-3 text-xs">
                Publishing is immediate. The publish date is recorded automatically the first time
                this post goes live.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Categories</h2>

              <p className="mb-2 text-sm font-medium">Select Categories</p>

              {value.categories.length > 0 ? (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {value.categories.map((entry) => (
                    <li key={entry}>
                      <Badge tone="brand" className="gap-1.5 pr-1.5">
                        {entry}
                        <button
                          type="button"
                          aria-label={`Remove ${entry}`}
                          onClick={() =>
                            patch({ categories: value.categories.filter((item) => item !== entry) })
                          }
                          className="hover:bg-brand-200 focus-visible:outline-ring flex size-4 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Select
                value=""
                onValueChange={(next) => {
                  if (!value.categories.includes(next)) {
                    patch({ categories: [...value.categories, next] });
                  }
                }}
              >
                <SelectTrigger aria-label="Add a category">
                  <SelectValue placeholder="Add a category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((entry) => !value.categories.includes(entry))
                    .map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <p className="text-muted-foreground mt-2 text-xs">
                Choose one or more categories for this post.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-5 text-lg font-semibold">SEO Settings</h2>

              <div className="flex flex-col gap-5">
                <FormField
                  label="Meta Title"
                  hint={`${value.metaTitle.length} characters · 50–60 recommended`}
                >
                  <Input
                    value={value.metaTitle}
                    onChange={(event) => patch({ metaTitle: event.target.value })}
                  />
                </FormField>

                <FormField
                  label="Meta Description"
                  hint={`${value.metaDescription.length} characters · 120–160 recommended`}
                >
                  <Textarea
                    rows={4}
                    value={value.metaDescription}
                    onChange={(event) => patch({ metaDescription: event.target.value })}
                  />
                </FormField>

                <FormField label="Keywords" hint="Enter keywords separated by commas.">
                  <Input
                    value={value.keywords}
                    onChange={(event) => patch({ keywords: event.target.value })}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
