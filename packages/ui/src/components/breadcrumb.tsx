import * as React from 'react';

import { ChevronRight } from 'lucide-react';

/**
 * Server component by design: it takes a `renderLink` callback so apps can
 * supply their router's Link, and function props cannot cross a client
 * boundary. Nothing here needs state.
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** `Home > Rome Tours > Colosseum Underground Tour` */
export function Breadcrumb({
  items,
  className,
  renderLink,
}: {
  items: BreadcrumbItem[];
  className?: string;
  /** Lets the app supply its router's Link component. */
  renderLink?: (item: BreadcrumbItem) => React.ReactNode;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {isLast || !item.href ? (
                <span aria-current={isLast ? 'page' : undefined} className="text-primary">
                  {item.label}
                </span>
              ) : (
                (renderLink?.(item) ?? (
                  <a href={item.href} className="text-muted-foreground hover:text-primary">
                    {item.label}
                  </a>
                ))
              )}
              {!isLast ? (
                <ChevronRight className="text-muted-foreground size-3.5" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
