import React, { useRef, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  CheckSquare,
  Eye,
  PenLine,
} from 'lucide-react';
import { renderMarkdownBlocks } from '../../utils/markdownHelper';
import { getCmdLabel } from '../../utils/platform';

export interface RichInstructionsEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  className?: string;
  minHeight?: string;
}

export const RichInstructionsEditor: React.FC<RichInstructionsEditorProps> = ({
  value,
  onChange,
  placeholder = 'Add step instructions, context, or key guidance...',
  rows = 4,
  label = 'Instructions & Context',
  className = '',
  minHeight,
}) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const cmdKey = getCmdLabel();

  /**
   * Surrounds selected text with prefix and suffix (e.g. **bold**)
   */
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'text') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);

      // Check if already wrapped
      const before = text.substring(Math.max(0, start - prefix.length), start);
      const after = text.substring(end, end + suffix.length);

      let newText: string;
      let newSelectionStart: number;
      let newSelectionEnd: number;

      if (before === prefix && after === suffix) {
        // Unwrap
        newText = text.substring(0, start - prefix.length) + selected + text.substring(end + suffix.length);
        newSelectionStart = start - prefix.length;
        newSelectionEnd = end - prefix.length;
      } else {
        // Wrap
        const insertion = selected || defaultPlaceholder;
        newText = text.substring(0, start) + prefix + insertion + suffix + text.substring(end);
        newSelectionStart = start + prefix.length;
        newSelectionEnd = newSelectionStart + insertion.length;
      }

      onChange(newText);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newSelectionStart, newSelectionEnd);
        }
      });
    },
    [onChange]
  );

  /**
   * Toggles line prefix (e.g. - for bullets, 1. for numbered lists, > for blockquote)
   */
  const toggleLinePrefix = useCallback(
    (prefixType: 'bullet' | 'ordered' | 'quote' | 'check') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      // Find start of current line
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      // Find end of current selection's line
      const nextNewline = text.indexOf('\n', end);
      const lineEnd = nextNewline === -1 ? text.length : nextNewline;

      const lines = text.substring(lineStart, lineEnd).split('\n');

      let allPrefixed = false;
      if (prefixType === 'bullet') {
        allPrefixed = lines.every((l) => /^[-*]\s/.test(l));
      } else if (prefixType === 'ordered') {
        allPrefixed = lines.every((l) => /^\d+\.\s/.test(l));
      } else if (prefixType === 'quote') {
        allPrefixed = lines.every((l) => /^>\s/.test(l));
      } else if (prefixType === 'check') {
        allPrefixed = lines.every((l) => /^-\s\[[ x]\]\s/i.test(l));
      }

      const updatedLines = lines.map((line, idx) => {
        if (allPrefixed) {
          // Remove prefix
          return line
            .replace(/^[-*]\s/, '')
            .replace(/^\d+\.\s*/, '')
            .replace(/^>\s*/, '')
            .replace(/^-\s\[[ x]\]\s*/i, '');
        }

        // Clean any existing list prefix first
        const clean = line
          .replace(/^[-*]\s/, '')
          .replace(/^\d+\.\s*/, '')
          .replace(/^>\s*/, '')
          .replace(/^-\s\[[ x]\]\s*/i, '');

        if (prefixType === 'bullet') return `- ${clean}`;
        if (prefixType === 'ordered') return `${idx + 1}. ${clean}`;
        if (prefixType === 'quote') return `> ${clean}`;
        if (prefixType === 'check') return `- [ ] ${clean}`;
        return line;
      });

      const replacement = updatedLines.join('\n');
      const newText = text.substring(0, lineStart) + replacement + text.substring(lineEnd);
      onChange(newText);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(lineStart, lineStart + replacement.length);
        }
      });
    },
    [onChange]
  );

  /**
   * Handles keyboard shortcuts and smart Enter for list continuation
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+B / Cmd+B -> Bold
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrapSelection('**', '**', 'bold text');
      return;
    }

    // Ctrl+I / Cmd+I -> Italic
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrapSelection('*', '*', 'italic text');
      return;
    }

    // Smart Enter continuation for lists
    if (e.key === 'Enter' && !e.shiftKey) {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const text = textarea.value;
      const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
      const currentLine = text.substring(lineStart, cursor);

      // 1. Checklist item
      const checkMatch = currentLine.match(/^-\s\[[ x]\]\s*(.*)$/i);
      if (checkMatch) {
        e.preventDefault();
        if (!checkMatch[1].trim()) {
          // Empty checklist item -> clear line
          const newText = text.substring(0, lineStart) + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart));
        } else {
          // Continue checklist
          const insert = '\n- [ ] ';
          const newText = text.substring(0, cursor) + insert + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => {
            const pos = cursor + insert.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        return;
      }

      // 2. Unordered bullet item
      const bulletMatch = currentLine.match(/^([-*])\s*(.*)$/);
      if (bulletMatch) {
        e.preventDefault();
        if (!bulletMatch[2].trim()) {
          // Empty bullet item -> clear line to exit list
          const newText = text.substring(0, lineStart) + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart));
        } else {
          // Continue bullet list
          const insert = `\n${bulletMatch[1]} `;
          const newText = text.substring(0, cursor) + insert + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => {
            const pos = cursor + insert.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        return;
      }

      // 3. Ordered number item
      const orderMatch = currentLine.match(/^(\d+)\.\s*(.*)$/);
      if (orderMatch) {
        e.preventDefault();
        if (!orderMatch[2].trim()) {
          // Empty ordered item -> clear line
          const newText = text.substring(0, lineStart) + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart));
        } else {
          // Continue ordered list
          const nextNum = parseInt(orderMatch[1], 10) + 1;
          const insert = `\n${nextNum}. `;
          const newText = text.substring(0, cursor) + insert + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => {
            const pos = cursor + insert.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        return;
      }

      // 4. Blockquote item
      const quoteMatch = currentLine.match(/^>\s*(.*)$/);
      if (quoteMatch) {
        e.preventDefault();
        if (!quoteMatch[1].trim()) {
          // Empty quote -> clear
          const newText = text.substring(0, lineStart) + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart));
        } else {
          const insert = '\n> ';
          const newText = text.substring(0, cursor) + insert + text.substring(cursor);
          onChange(newText);
          requestAnimationFrame(() => {
            const pos = cursor + insert.length;
            textarea.setSelectionRange(pos, pos);
          });
        }
        return;
      }
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header bar: Label & Write/Preview Switcher */}
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </label>
        <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-md border border-zinc-200/80 dark:border-zinc-700/80 text-[10px]">
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors font-medium cursor-pointer ${
              activeTab === 'write'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
            title="Edit markdown instructions"
          >
            <PenLine className="w-3 h-3" />
            <span>Write</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors font-medium cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
            title="Preview formatted instructions"
          >
            <Eye className="w-3 h-3" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {activeTab === 'write' ? (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500 transition-all">
          {/* Rich Text Quick Action Toolbar */}
          <div className="flex items-center gap-0.5 px-1.5 py-1 bg-zinc-100/90 dark:bg-zinc-800 border-b border-zinc-200/80 dark:border-zinc-700/80 select-none overflow-x-auto">
            <button
              type="button"
              onClick={() => wrapSelection('**', '**', 'bold text')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title={`Bold (${cmdKey}+B)`}
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('*', '*', 'italic text')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title={`Italic (${cmdKey}+I)`}
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

            <button
              type="button"
              onClick={() => toggleLinePrefix('bullet')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Bullet List (- item)"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleLinePrefix('ordered')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Numbered List (1. item)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleLinePrefix('check')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Checklist (- [ ] item)"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>

            <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

            <button
              type="button"
              onClick={() => toggleLinePrefix('quote')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Quote / Callout note (> text)"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('`', '`', 'code')}
              className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Inline Code (`code`)"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Textarea */}
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={minHeight ? { minHeight } : undefined}
            className="w-full px-2.5 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none resize-none leading-relaxed font-sans placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
        </div>
      ) : (
        /* Formatted Markdown Live Preview */
        <div
          style={minHeight ? { minHeight } : undefined}
          className="p-2.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 overflow-y-auto"
        >
          {value && value.trim() ? (
            <div className="prose dark:prose-invert max-w-none text-xs">
              {renderMarkdownBlocks(value)}
            </div>
          ) : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
              No instructions provided yet. Switch to "Write" to add instructions or notes.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
