import type { ReactNode } from "react";

type SearchHighlightProps = {
  value: string | number | null | undefined;
  query?: string;
  className?: string;
};

/** Render a searchable value with every case-insensitive query match marked. */
export function SearchHighlight({ value, query = "", className }: SearchHighlightProps): ReactNode {
  if (value === null || value === undefined) return null;

  const text = String(value);
  const needle = query.trim();
  if (!needle) return text;

  const normalizedText = text.toLocaleLowerCase("zh-Hant");
  const normalizedNeedle = needle.toLocaleLowerCase("zh-Hant");
  if (!normalizedNeedle) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedNeedle, cursor);
  let matchKey = 0;

  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));
    const match = text.slice(matchIndex, matchIndex + needle.length);
    parts.push(
      <mark className={className ?? "search-match"} data-search-match="true" key={`match-${matchKey}`}>
        {match}
      </mark>
    );
    matchKey += 1;
    cursor = matchIndex + needle.length;
    matchIndex = normalizedText.indexOf(normalizedNeedle, cursor);
  }

  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
