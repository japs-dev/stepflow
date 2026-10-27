import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Maximize2,
  X,
  BookOpen,
  Columns
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
  minHeight?: string | number;
  defaultHeight?: number;
  allowManualResize?: boolean;
  allowExpandModal?: boolean;
  stepTitle?: string;
}

export const RichInstructionsEditor: React.FC<RichInstructionsEditorProps> = ({
  value,
  onChange,
  placeholder = 'Add step instructions, context, or key guidance...',
  rows = 6,
  label = 'Instructions & Context',
  className = '',
  minHeight,
  defaultHeight,
  allowManualResize = true,
  allowExpandModal = true,
  stepTitle,
}) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [isExpandedModal, setIsExpandedModal] = useState(false);
  const [modalViewMode, setModalViewMode] = useState<'split' | 'write' | 'preview'>('split');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const cmdKey = getCmdLabel();

  // Parse height from minHeight or defaultHeight (defaulting to 180px for a comfortable, spacious editor)
  const parseHeight = useCallback((val?: string | number): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 180;
  }, []);

  const [editorHeight, setEditorHeight] = useState<number>(() => {
    if (defaultHeight) return defaultHeight;
    if (minHeight) return parseHeight(minHeight);
    return 180;
  });

  useEffect(() => {
    if (defaultHeight) {
      setEditorHeight(defaultHeight);
    } else if (minHeight) {
      setEditorHeight(parseHeight(minHeight));
    }
  }, [defaultHeight, minHeight, parseHeight]);

  // Return the active textarea depending on whether modal or inline view is active
  const getActiveTextarea = useCallback(() => {
    if (isExpandedModal && modalTextareaRef.current) {
      return modalTextareaRef.current;
    }
    return textareaRef.current;
  }, [isExpandedModal]);

  /**
   * Surrounds selected text with prefix and suffix (e.g. **bold**)
   */
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'text') => {
      const textarea = getActiveTextarea();
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
        const activeEl = getActiveTextarea();
        if (activeEl) {
          activeEl.focus();
          activeEl.setSelectionRange(newSelectionStart, newSelectionEnd);
        }
      });
    },
    [getActiveTextarea, onChange]
  );

  /**
   * Toggles line prefix (e.g. - for bullets, 1. for numbered lists, > for blockquote)
   */
  const toggleLinePrefix = useCallback(
    (prefixType: 'bullet' | 'ordered' | 'quote' | 'check') => {
      const textarea = getActiveTextarea();
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
        const clean = line
          .replace(/^[-*]\s/, '')
          .replace(/^\d+\.\s*/, '')
          .replace(/^>\s*/, '')
          .replace(/^-\s\[[ x]\]\s*/i, '');

        if (allPrefixed) {
          return clean;
        }

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
        const activeEl = getActiveTextarea();
        if (activeEl) {
          activeEl.focus();
          activeEl.setSelectionRange(lineStart, lineStart + replacement.length);
        }
      });
    },
    [getActiveTextarea, onChange]
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
      const textarea = getActiveTextarea();
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

  /**
   * Drag-to-resize handler for vertical expanding
   */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = editorHeight;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY;
        const newHeight = Math.max(120, Math.min(800, startHeight + delta));
        setEditorHeight(newHeight);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editorHeight]
  );

  // Close modal on Escape key
  useEffect(() => {
    if (!isExpandedModal) return;
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpandedModal(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isExpandedModal]);

  /**
   * Reusable Rich Text Quick Action Toolbar
   */
  const renderToolbar = (isModal = false) => (
    <div
      className={`flex items-center gap-0.5 select-none overflow-x-auto shrink-0 ${
        isModal
          ? 'px-3 py-1.5 bg-zinc-100/90 dark:bg-zinc-800/90 border-b border-zinc-200 dark:border-zinc-700/80'
          : 'px-1.5 py-1 bg-zinc-100/90 dark:bg-zinc-800 border-b border-zinc-200/80 dark:border-zinc-700/80'
      }`}
    >
      <button
        type="button"
        onClick={() => wrapSelection('**', '**', 'bold text')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title={`Bold (${cmdKey}+B)`}
      >
        <Bold className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>
      <button
        type="button"
        onClick={() => wrapSelection('*', '*', 'italic text')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title={`Italic (${cmdKey}+I)`}
      >
        <Italic className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>

      <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      <button
        type="button"
        onClick={() => toggleLinePrefix('bullet')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title="Bullet List (- item)"
      >
        <List className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>
      <button
        type="button"
        onClick={() => toggleLinePrefix('ordered')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title="Numbered List (1. item)"
      >
        <ListOrdered className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>
      <button
        type="button"
        onClick={() => toggleLinePrefix('check')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title="Checklist (- [ ] item)"
      >
        <CheckSquare className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>

      <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

      <button
        type="button"
        onClick={() => toggleLinePrefix('quote')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title="Quote / Callout note (> text)"
      >
        <Quote className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>
      <button
        type="button"
        onClick={() => wrapSelection('`', '`', 'code')}
        className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        title="Inline Code (`code`)"
      >
        <Code className={isModal ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      </button>
    </div>
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header bar: Label & Controls */}
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </label>
        <div className="flex items-center gap-1">
          {/* Write / Preview Tab Switcher */}
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

          {/* Expand into Full Editor Modal */}
          {allowExpandModal && (
            <button
              type="button"
              onClick={() => setIsExpandedModal(true)}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Expand instructions editor"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Editor Box Container with Uniform Height & Optional Resize Handle */}
      <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500 transition-all flex flex-col shadow-2xs">
        {/* Quick Action Toolbar */}
        {renderToolbar(false)}

        {/* Content Area (Explicit height, internally scrollable) */}
        <div style={{ height: `${editorHeight}px` }} className="flex flex-col min-h-0 w-full relative">
          {activeTab === 'write' ? (
            <textarea
              ref={textareaRef}
              rows={rows}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full h-full p-2.5 bg-transparent text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none resize-none leading-relaxed font-sans placeholder:text-zinc-400 dark:placeholder:text-zinc-500 overflow-y-auto"
            />
          ) : (
            <div className="w-full h-full p-2.5 bg-white dark:bg-zinc-900/60 overflow-y-auto">
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

        {/* Bottom Drag-to-Resize Handle */}
        {allowManualResize && (
          <div
            onMouseDown={handleResizeStart}
            className="h-2 w-full bg-zinc-100/90 dark:bg-zinc-800/90 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-t border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center cursor-row-resize transition-colors group select-none shrink-0"
            title="Drag down/up to resize instructions window"
          >
            <div className="w-8 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-600 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 transition-colors" />
          </div>
        )}
      </div>

      {/* Expanded Focus Modal */}
      {isExpandedModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsExpandedModal(false);
            }}
          >
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-4xl flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="h-12 px-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/70 dark:bg-zinc-900/70">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {label}
                    </h3>
                    {stepTitle && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                        {stepTitle}
                      </p>
                    )}
                  </div>
                </div>

                {/* View Mode Switcher in Modal */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
                    <button
                      type="button"
                      onClick={() => setModalViewMode('split')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        modalViewMode === 'split'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                      title="Side-by-side editing and live preview"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Split</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalViewMode('write')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        modalViewMode === 'write'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      <span>Write</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalViewMode('preview')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        modalViewMode === 'preview'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsExpandedModal(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Close expanded view (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {renderToolbar(true)}

                <div className="flex-1 flex min-h-[400px] max-h-[65vh] overflow-hidden">
                  {/* Left Column: Write Area */}
                  {(modalViewMode === 'split' || modalViewMode === 'write') && (
                    <div
                      className={`h-full flex flex-col min-h-0 ${
                        modalViewMode === 'split' ? 'w-1/2 border-r border-zinc-200 dark:border-zinc-800' : 'w-full'
                      }`}
                    >
                      <textarea
                        ref={modalTextareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className="w-full h-full p-4 bg-transparent text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none resize-none leading-relaxed font-sans placeholder:text-zinc-400 dark:placeholder:text-zinc-500 overflow-y-auto"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Right Column: Preview Area */}
                  {(modalViewMode === 'split' || modalViewMode === 'preview') && (
                    <div
                      className={`h-full p-4 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/50 ${
                        modalViewMode === 'split' ? 'w-1/2' : 'w-full'
                      }`}
                    >
                      {value && value.trim() ? (
                        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                          {renderMarkdownBlocks(value)}
                        </div>
                      ) : (
                        <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
                          No instructions provided yet. Write instructions on the left to see live preview.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="h-11 px-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/80 dark:bg-zinc-900/80 text-xs">
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Supports GitHub Flavored Markdown • {value ? `${value.length} characters` : '0 characters'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpandedModal(false)}
                  className="px-3.5 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium text-xs hover:bg-zinc-800 dark:hover:bg-white cursor-pointer shadow-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
