/**
 * Static option lists used by the create/edit forms.
 *
 * The editors post a full document rather than reading one, so they do not need
 * a round-trip just to populate two selects. Both lists mirror what the API
 * returns from `/locations` and `/blog/categories`.
 */
export const LOCATION_NAMES = [
  'Rome, Italy',
  'Vatican City',
  'Florence, Italy',
  'Venice, Italy',
  'Tuscany, Italy',
  'Naples, Italy',
];

export const BLOG_CATEGORIES = [
  'Travel Guide',
  'Attractions',
  'Food & Drink',
  'Local Tips',
  'News & Updates',
];
