import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Copy,
  Check,
  Edit2,
  Trash2,
  Tag,
  FileQuestion,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useSopStore, normalizeImagePathForRenderer } from '../../store/useSopStore';
import { ErrorFaqItem } from '../../types/sop';
import { renderMarkdownBlocks, stripMarkdown } from '../../utils/markdownHelper';

interface ErrorSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditItem?: (item: ErrorFaqItem) => void;
  onAddNew?: () => void;
}

export const ErrorSearchModal: React.FC<ErrorSearchModalProps> = ({
  isOpen,
  onClose,
  onEditItem,
  onAddNew,
}) => {
  const { errorFaqItems, loadErrorFaq, deleteErrorFaqItem } = useSopStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load FAQ items on open
  useEffect(() => {
    if (isOpen) {
      loadErrorFaq();
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, loadErrorFaq]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return errorFaqItems;
    const q = query.toLowerCase().trim();
    return errorFaqItems.filter((item) => {
      const matchCode = item.errorCode?.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchTags = item.tags.some((t) => t.toLowerCase().includes(q));
      const matchOcr = item.rawOcrText.toLowerCase().includes(q);
      const matchSol = item.solution.toLowerCase().includes(q);
      return matchCode || matchTitle || matchTags || matchOcr || matchSol;
    });
  }, [errorFaqItems, query]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const activeItem: ErrorFaqItem | undefined = filteredItems[selectedIndex];

  // Keyboard navigation: Escape to close, Up/Down to navigate
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
      } else if (e.key === 'Enter' && e.ctrlKey && activeItem) {
        e.preventDefault();
        handleCopySolution(activeItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems.length, activeItem, onClose]);

  const handleCopySolution = (item: ErrorFaqItem) => {
    if (!item.solution) return;
    navigator.clipboard.writeText(item.solution);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2200);
  };

  const handleDelete = async (item: ErrorFaqItem) => {
    if (window.confirm(`Delete solution for "${item.title}"?`)) {
      await deleteErrorFaqItem(item.id);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight Top Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800 bg-zinc-950/70">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type error code (e.g. 0x80040115, SAP-1049), symptoms, or keywords..."
            className="flex-1 bg-transparent border-none text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700">
            <span>ESC</span>
            <span className="text-zinc-500">to close</span>
          </div>
        </div>

        {/* Modal Body: Split view (List on left, Preview on right) */}
        <div className="flex-1 flex min-h-[380px] overflow-hidden">
          {/* Left: Results List */}
          <div className="w-2/5 border-r border-zinc-800 overflow-y-auto p-2 space-y-1 bg-zinc-900/60">
            {filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                <FileQuestion className="w-8 h-8 text-zinc-500 mb-2" />
                <p className="text-xs font-medium text-zinc-300">No matching solutions</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {query ? `No solutions for "${query}"` : 'Knowledge base is currently empty'}
                </p>
                {onAddNew && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAddNew();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Error Solution</span>
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-blue-600/20 border border-blue-500/60 shadow-sm'
                        : 'hover:bg-zinc-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {item.title}
                      </span>
                      {item.errorCode && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                          {item.errorCode}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-zinc-400 line-clamp-2">
                      {stripMarkdown(item.solution)}
                    </p>

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.tags.slice(0, 3).map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Solution Details & Copy Button */}
          <div className="flex-1 flex flex-col overflow-y-auto p-4 bg-zinc-950/40">
            {activeItem ? (
              <div className="flex flex-col h-full space-y-4">
                {/* Header with Title and Code */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">{activeItem.title}</h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      {activeItem.errorCode && (
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Code: {activeItem.errorCode}
                        </span>
                      )}
                      <span>•</span>
                      <span>Updated {new Date(activeItem.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Top Action Icons */}
                  <div className="flex items-center gap-1">
                    {onEditItem && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEditItem(activeItem);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Edit solution"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(activeItem)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Delete solution"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Primary Action: One-Click Copy to Clipboard */}
                <button
                  type="button"
                  onClick={() => handleCopySolution(activeItem)}
                  className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                    copiedId === activeItem.id
                      ? 'bg-emerald-600 text-white shadow-emerald-900/50'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-900/30 active:scale-[0.99]'
                  }`}
                >
                  {copiedId === activeItem.id ? (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span className="font-bold">Copied to Clipboard! (Ready to paste)</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Solution to Clipboard</span>
                      <span className="text-[10px] opacity-75 font-mono ml-1">(Ctrl+Enter)</span>
                    </>
                  )}
                </button>

                {/* Tags */}
                {activeItem.tags && activeItem.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3.5 h-3.5 text-zinc-500" />
                    {activeItem.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Screenshot preview (if available) */}
                {activeItem.imagePath && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Error Screenshot Reference
                    </span>
                    <div
                      className="relative rounded-lg overflow-hidden border border-zinc-700/80 max-h-36 bg-zinc-950 group cursor-pointer"
                      onClick={() => setImagePreviewUrl(normalizeImagePathForRenderer(activeItem.imagePath) || '')}
                      title="Click to expand screenshot"
                    >
                      <img
                        src={normalizeImagePathForRenderer(activeItem.imagePath) || ''}
                        alt={activeItem.title}
                        className="w-full h-full object-contain max-h-36"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-xs text-white">
                        <ExternalLink className="w-4 h-4" />
                        <span>View Full Screenshot</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Solution Rendered Markdown */}
                <div className="space-y-1 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Step-by-Step Verified Solution
                  </span>
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 leading-relaxed font-sans prose prose-invert max-w-none">
                    {renderMarkdownBlocks(activeItem.solution)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                Select an error from the list to preview the solution
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span>
              Use <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px]">↑</kbd>{' '}
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px]">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px]">Ctrl+Enter</kbd> to copy
            </span>
          </div>
          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAddNew();
              }}
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Error Solution</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Screenshot Lightbox */}
      {imagePreviewUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/85 flex items-center justify-center p-6"
          onClick={() => setImagePreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-xl bg-zinc-900 border border-zinc-700 p-2">
            <button
              type="button"
              onClick={() => setImagePreviewUrl(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-800/80 text-white hover:bg-zinc-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={imagePreviewUrl}
              alt="Screenshot full size"
              className="max-h-[82vh] w-auto object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};
