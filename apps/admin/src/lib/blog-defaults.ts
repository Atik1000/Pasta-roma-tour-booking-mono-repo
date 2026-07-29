import type { BlogEditorValue } from '@/components/blogs/blog-editor';

export function emptyBlog(): BlogEditorValue {
  return {
    title: '',
    slug: '',
    coverImage: null,
    content: '',
    status: 'DRAFT',
    categories: [],
    metaTitle: '',
    metaDescription: '',
    keywords: '',
  };
}
