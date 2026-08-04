import * as React from 'react';

/**
 * Minimal Markdown renderer for blog bodies.
 *
 * Deliberately not `dangerouslySetInnerHTML`: the content is parsed into React
 * elements, so a post can never inject markup or script into the page. It
 * supports exactly what the editor's toolbar produces — headings, lists,
 * quotes, bold, italic and links.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => (
        <Block key={index} raw={block.trim()} />
      ))}
    </div>
  );
}

function Block({ raw }: { raw: string }) {
  if (raw.startsWith('### ')) {
    return <h3 className="font-display text-lg font-semibold">{inline(raw.slice(4))}</h3>;
  }

  if (raw.startsWith('## ')) {
    return <h2 className="font-display text-xl font-semibold">{inline(raw.slice(3))}</h2>;
  }

  if (raw.startsWith('# ')) {
    return <h2 className="font-display text-2xl font-semibold">{inline(raw.slice(2))}</h2>;
  }

  if (raw.startsWith('> ')) {
    return (
      <blockquote className="border-primary text-muted-foreground border-l-2 pl-4 italic">
        {inline(raw.replace(/^> ?/gm, ''))}
      </blockquote>
    );
  }

  const lines = raw.split('\n');

  if (lines.every((line) => /^[-*] /.test(line))) {
    return (
      <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.slice(2))}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => /^\d+\. /.test(line))) {
    return (
      <ol className="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.replace(/^\d+\. /, ''))}</li>
        ))}
      </ol>
    );
  }

  return <p className="text-muted-foreground leading-relaxed">{inline(raw)}</p>;
}

/** Splits a line into text and the inline marks the toolbar can produce. */
function inline(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter((part) => part !== '');

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <s key={index}>{part.slice(2, -2)}</s>;
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      const isExternal = href?.startsWith('http') ?? false;
      return (
        <a
          key={index}
          href={href}
          className="text-primary underline underline-offset-4"
          {...(isExternal ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        >
          {label}
        </a>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}
