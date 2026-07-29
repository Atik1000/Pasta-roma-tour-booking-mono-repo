/** `10 Must-See Attractions in Rome` → `10-must-see-attractions-in-rome`. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function truncate(input: string, maxLength: number, suffix = '…'): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

/** `John Michael Smith` → `JS` — avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function capitalize(input: string): string {
  return input.length === 0 ? input : `${input[0]?.toUpperCase() ?? ''}${input.slice(1)}`;
}

/** `PAYMENT_PENDING` → `Payment Pending` — renders enum values as UI labels. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => capitalize(word))
    .join(' ');
}

/** Strips markup so blog content can be summarised or counted safely. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function wordCount(input: string): number {
  const text = stripHtml(input);
  return text.length === 0 ? 0 : text.split(/\s+/).length;
}
