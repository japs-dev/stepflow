import React from 'react';

/**
 * Strips markdown syntax to return clean text for summaries, TOC, search, and plain-text exporters.
 * Pass `{ preserveNewlines: true }` when rendering multi-line plain text (e.g., PDF/PPTX step descriptions).
 */
export function stripMarkdown(content?: string, options?: { preserveNewlines?: boolean }): string {
  if (!content) return '';
  const cleaned = content
    .replace(/^###\s+/gm, '')
    .replace(/^##\s+/gm, '')
    .replace(/^#\s+/gm, '')
    .replace(/^-\s\[x\]\s*/gim, '• [x] ')
    .replace(/^-\s\[\s\]\s*/gim, '• [ ] ')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, (m) => (options?.preserveNewlines ? m : ''))
    .replace(/^>\s+/gm, options?.preserveNewlines ? '  ' : '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');
  return options?.preserveNewlines ? cleaned.trim() : cleaned.replace(/\n+/g, ' ').trim();
}

/**
 * Parses inline markdown: **bold**, *italic*, and `code`.
 */
export function renderMarkdownInline(text: string): React.ReactNode {
  // Regex splitting by bold (**...**), italic (*...*), or inline code (`...`)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-zinc-800 dark:text-zinc-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/60 font-mono text-[11px] text-pink-600 dark:text-pink-400"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Parses multi-line markdown content into structured React components
 * with support for headers, blockquotes, unordered/ordered lists, and inline formatting.
 */
export function renderMarkdownBlocks(content?: string): React.ReactNode {
  if (!content || !content.trim()) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (key: number) => {
    if (!currentList) return null;
    const isUl = currentList.type === 'ul';
    const listElement = isUl ? (
      <ul key={`list-${key}`} className="list-disc pl-5 my-1.5 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
        {currentList.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderMarkdownInline(item)}
          </li>
        ))}
      </ul>
    ) : (
      <ol key={`list-${key}`} className="list-decimal pl-5 my-1.5 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
        {currentList.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderMarkdownInline(item)}
          </li>
        ))}
      </ol>
    );
    currentList = null;
    return listElement;
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Check for unordered list items: - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.slice(2);
      if (!currentList || currentList.type !== 'ul') {
        const flushed = flushList(lineIdx);
        if (flushed) elements.push(flushed);
        currentList = { type: 'ul', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      return;
    }

    // Check for ordered list items: 1. 2. etc.
    if (/^\d+\.\s/.test(trimmed)) {
      const itemText = trimmed.replace(/^\d+\.\s*/, '');
      if (!currentList || currentList.type !== 'ol') {
        const flushed = flushList(lineIdx);
        if (flushed) elements.push(flushed);
        currentList = { type: 'ol', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      return;
    }

    // If we were building a list and hit a non-list line, flush it
    if (currentList) {
      const flushed = flushList(lineIdx);
      if (flushed) elements.push(flushed);
    }

    // Blank line
    if (!trimmed) {
      elements.push(<div key={`blank-${lineIdx}`} className="h-1" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${lineIdx}`} className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-2 mb-1">
          {renderMarkdownInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${lineIdx}`} className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-2.5 mb-1">
          {renderMarkdownInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${lineIdx}`} className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1">
          {renderMarkdownInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${lineIdx}`}
          className="pl-2.5 my-1.5 border-l-2 border-zinc-400 dark:border-zinc-600 text-xs italic text-zinc-600 dark:text-zinc-400"
        >
          {renderMarkdownInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    // Paragraph
    elements.push(
      <p key={`p-${lineIdx}`} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed my-0.5">
        {renderMarkdownInline(line)}
      </p>
    );
  });

  // Flush any trailing list
  if (currentList) {
    const flushed = flushList(lines.length);
    if (flushed) elements.push(flushed);
  }

  return <div className="space-y-0.5">{elements}</div>;
}
