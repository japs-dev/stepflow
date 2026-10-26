import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Copy,
  Check,
  Edit2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useSopStore, normalizeImagePathForRenderer } from '../../store/useSopStore';
import { ErrorFaqItem } from '../../types/sop';
import { stripMarkdown } from '../../utils/markdownHelper';
import { ErrorFaqEditorModal } from './ErrorFaqEditorModal';

interface ErrorKnowledgeBaseViewProps {
  onOpenSearchHud?: () => void;
  searchQuery?: string;
  onAddNew?: () => void;
  onEditItem?: (item: ErrorFaqItem) => void;
}

export const ErrorKnowledgeBaseView: React.FC<ErrorKnowledgeBaseViewProps> = ({
  onOpenSearchHud,
  searchQuery: externalSearchQuery,
  onAddNew,
  onEditItem,
}) => {
  const { errorFaqItems, loadErrorFaq, deleteErrorFaqItem } = useSopStore();

  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : localSearchQuery;
  const setSearchQuery = setLocalSearchQuery;
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editorItem, setEditorItem] = useState<ErrorFaqItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadErrorFaq();
  }, [loadErrorFaq]);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of errorFaqItems) {
      if (item.tags) {
        for (const t of item.tags) set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [errorFaqItems]);

  // Filter items based on search and tag
  const filteredItems = useMemo(() => {
    return errorFaqItems.filter((item) => {
      if (selectedTag && (!item.tags || !item.tags.includes(selectedTag))) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCode = item.errorCode?.toLowerCase().includes(q);
      const matchSol = item.solution.toLowerCase().includes(q);
      const matchTag = item.tags?.some((t) => t.toLowerCase().includes(q));
      return matchTitle || matchCode || matchSol || matchTag;
    });
  }, [errorFaqItems, searchQuery, selectedTag]);

  const handleCopySolution = (item: ErrorFaqItem) => {
    if (!item.solution) return;
    navigator.clipboard.writeText(item.solution);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleDelete = async (item: ErrorFaqItem) => {
    if (window.confirm(`Are you sure you want to delete the solution for "${item.title}"?`)) {
      await deleteErrorFaqItem(item.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full max-w-6xl mx-auto p-6 md:p-8 animate-fadeIn">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search error solutions by title, error code, symptoms, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenSearchHud}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium border border-zinc-200 dark:border-zinc-700 transition-colors shadow-xs cursor-pointer"
            title="Open Spotlight Search (Ctrl+Shift+F)"
          >
            <Search className="w-3.5 h-3.5 text-blue-500" />
            <span>Spotlight HUD</span>
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 ml-1">
              Ctrl+Shift+F
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onAddNew) {
                onAddNew();
              } else {
                setEditorItem(null);
                setIsEditorOpen(true);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Error Solution</span>
          </button>
        </div>
      </div>

      {/* Tag Filter Pills */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`text-xs px-2.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
              selectedTag === null
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            All Errors ({errorFaqItems.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`text-xs px-2.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
                selectedTag === tag
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      {filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl p-12 text-center bg-white/50 dark:bg-zinc-900/40">
          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-500 mb-3 border border-blue-200 dark:border-blue-900">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            {searchQuery || selectedTag ? 'No matching error solutions' : 'No error solutions saved yet'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-4">
            {searchQuery || selectedTag
              ? 'Try modifying your search query or removing the tag filter.'
              : 'Drag-and-drop error screenshots onto the floating HUD pill or click below to build your offline FAQ database.'}
          </p>
          {searchQuery || selectedTag ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedTag(null);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 underline font-medium cursor-pointer"
            >
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onAddNew) {
                  onAddNew();
                } else {
                  setEditorItem(null);
                  setIsEditorOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Your First Error Solution</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-sm hover:shadow-md"
            >
              <div className="space-y-2.5">
                {/* Title & Code */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">
                    {item.title}
                  </h4>
                  {item.errorCode && (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                      {item.errorCode}
                    </span>
                  )}
                </div>

                {/* Screenshot thumbnail if available */}
                {item.imagePath && (
                  <div className="h-24 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 flex items-center justify-center">
                    <img
                      src={normalizeImagePathForRenderer(item.imagePath) || ''}
                      alt={item.title}
                      className="max-h-24 w-full object-contain"
                    />
                  </div>
                )}

                {/* Solution preview snippet */}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                  {stripMarkdown(item.solution)}
                </p>

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions Bar */}
              <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCopySolution(item)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    copiedId === item.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  }`}
                  title="Copy formatted solution to clipboard to paste into WhatsApp or Email"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Solution</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onEditItem) {
                        onEditItem(item);
                      } else {
                        setEditorItem(item);
                        setIsEditorOpen(true);
                      }
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Edit solution"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Delete solution"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <ErrorFaqEditorModal
        isOpen={isEditorOpen}
        itemToEdit={editorItem}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorItem(null);
        }}
        onSaved={() => {
          loadErrorFaq();
        }}
      />
    </div>
  );
};
