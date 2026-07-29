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

/** Stands in for `GET /admin/blogs/:id` until Phase 9. */
export function loadBlog(id: string): BlogEditorValue {
  return {
    id,
    title: '10 Must-See Attractions in Rome',
    slug: '10-must-see-attractions-in-rome',
    coverImage: 'cover',
    status: 'PUBLISHED',
    categories: ['Travel Guides', 'Attractions', 'Local Tips'],
    metaTitle: '10 Must-See Attractions in Rome',
    metaDescription:
      'Discover the best attractions in Rome, from ancient ruins to stunning landmarks. Plan your perfect trip to the Eternal City.',
    keywords: 'rome attractions, colosseum, vatican, trevi fountain, rome travel tips',
    content: `Rome is a city that blends history, art, and culture at every corner. Whether it's your first visit or the tenth, these must-see attractions will make your trip unforgettable.

## 1. The Colosseum

Step into the heart of ancient Rome and explore one of the world's most iconic landmarks. A masterpiece of engineering and history.

## 2. Vatican City & St. Peter's Basilica

Home to the Pope and one of the most magnificent religious sites in the world, Vatican City offers breathtaking art and spiritual significance.

## 3. Trevi Fountain

Make a wish and toss a coin into the Trevi Fountain — a timeless tradition in the heart of Rome.`,
  };
}
