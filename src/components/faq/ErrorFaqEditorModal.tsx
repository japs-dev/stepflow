import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Tag,
  AlertTriangle,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { useSopStore, normalizeImagePathForRenderer } from '../../store/useSopStore';
import { ErrorFaqItem } from '../../types/sop';
import { RichInstructionsEditor } from '../studio/RichInstructionsEditor';

interface ErrorFaqEditorModalProps {
  isOpen: boolean;
  itemToEdit?: ErrorFaqItem | null;
  initialData?: {
    title?: string;
    errorCode?: string;
    rawOcrText?: string;
    imagePath?: string;
    solution?: string;
  };
  onClose: () => void;
  onSaved?: (savedItem: ErrorFaqItem) => void;
}

export const ErrorFaqEditorModal: React.FC<ErrorFaqEditorModalProps> = ({
  isOpen,
  itemToEdit,
  initialData,
  onClose,
  onSaved,
}) => {
  const { saveErrorFaqItem } = useSopStore();

  const [title, setTitle] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [solution, setSolution] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [rawOcrText, setRawOcrText] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (itemToEdit) {
        setTitle(itemToEdit.title || '');
        setErrorCode(itemToEdit.errorCode || '');
        setSolution(itemToEdit.solution || '');
        setTagsInput(itemToEdit.tags?.join(', ') || '');
        setRawOcrText(itemToEdit.rawOcrText || '');
        setImagePath(itemToEdit.imagePath || '');
      } else {
        setTitle(initialData?.title || '');
        setErrorCode(initialData?.errorCode || '');
        setSolution(initialData?.solution || '');
        setTagsInput('');
        setRawOcrText(initialData?.rawOcrText || '');
        setImagePath(initialData?.imagePath || '');
      }
    }
  }, [isOpen, itemToEdit, initialData]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter an error title');
      return;
    }

    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const id = itemToEdit?.id || `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const item: ErrorFaqItem = {
        id,
        title: title.trim(),
        errorCode: errorCode.trim() ? errorCode.trim().toUpperCase() : undefined,
        rawOcrText: rawOcrText.trim() || title.trim(),
        imagePath: imagePath || '',
        solution: solution.trim() || 'No solution provided yet.',
        tags,
        createdAt: itemToEdit?.createdAt || now,
        updatedAt: now,
        matchCount: itemToEdit?.matchCount || 0,
      };

      const success = await saveErrorFaqItem(item);
      if (success) {
        onSaved?.(item);
        onClose();
      } else {
        alert('Failed to save error solution.');
      }
    } catch (err) {
      console.error('Error saving FAQ item:', err);
      alert('An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {itemToEdit ? 'Edit Error & Solution' : 'Add New Error Solution'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Store in local knowledge base for automatic matching and quick clipboard replies.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title & Code in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Error Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Outlook Cannot Connect to Exchange Server"
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Error Code <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={errorCode}
                onChange={(e) => setErrorCode(e.target.value)}
                placeholder="e.g. 0x80040115, SAP-1049"
                className="w-full px-3 py-2 text-xs font-mono uppercase rounded-lg bg-zinc-800/80 border border-zinc-700 text-amber-300 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-zinc-500" />
              <span>Tags <span className="text-zinc-500 font-normal">(comma-separated)</span></span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. Outlook, VPN, Network, Credentials"
              className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Screenshot Reference (if attached) */}
          {imagePath && (
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3 h-3 text-zinc-500" />
                  <span>Associated Error Screenshot</span>
                </span>
                <button
                  type="button"
                  onClick={() => setImagePath('')}
                  className="text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove image</span>
                </button>
              </label>
              <div className="rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 p-1 max-h-32 flex items-center justify-center">
                <img
                  src={normalizeImagePathForRenderer(imagePath) || ''}
                  alt="Error screenshot reference"
                  className="max-h-28 object-contain rounded"
                />
              </div>
            </div>
          )}

          {/* Solution Editor */}
          <div>
            <RichInstructionsEditor
              value={solution}
              onChange={setSolution}
              label="Step-by-Step Verified Solution (Copied directly to Clipboard)"
              placeholder="1. Open Control Panel > Mail&#10;2. Click Email Accounts > Repair&#10;3. Restart Outlook."
              rows={6}
              minHeight="140px"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Error Solution'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
