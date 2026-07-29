export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Compile-time exhaustiveness check for switch statements over unions. */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function groupBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T[]> {
  return items.reduce<Record<K, T[]>>(
    (accumulator, item) => {
      const group = key(item);
      const bucket = accumulator[group] ?? [];
      bucket.push(item);
      accumulator[group] = bucket;
      return accumulator;
    },
    {} as Record<K, T[]>,
  );
}

export function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
