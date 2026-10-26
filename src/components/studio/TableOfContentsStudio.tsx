import React from 'react';
import {
  ListOrdered,
  ArrowRight
} from 'lucide-react';
import { useSopStore, isDefaultStepTitle } from '../../store/useSopStore';
import { SopStep } from '../../types/sop';
import { stripMarkdown } from '../../utils/markdownHelper';

export const TableOfContentsStudio: React.FC = () => {
  const { activeProject, setActiveStepId, updateCoverPageSettings } = useSopStore();

  if (!activeProject) return null;

  const cover = activeProject.coverPage;
  const isEnabled = cover?.showTableOfContents !== false;

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto bg-zinc-100/60 dark:bg-zinc-950/60 p-4 md:p-8 items-center select-none">
      {/* Top Banner Control Header */}
      <div className="w-full max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl p-4 mb-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <ListOrdered className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Table of Contents (Index)
              </h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isEnabled
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {isEnabled ? 'Included in Document' : 'Optional / Disabled'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Structured step index automatically inserted after the front cover page in exports.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => updateCoverPageSettings({ showTableOfContents: e.target.checked })}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Include in Document</span>
          </label>
        </div>
      </div>

      {/* A4 Table of Contents Preview Sheet */}
      <div className="w-full max-w-3xl flex flex-col items-center">
        <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden p-8 md:p-12 transition-all">
          {/* Header Title */}
          <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5 mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 font-mono">
              DOCUMENT OUTLINE
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
              Table of Contents
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {activeProject.name} • {activeProject.steps.length} Steps
            </p>
          </div>

          {/* List of Steps in Index */}
          <div className="space-y-2.5">
            {activeProject.steps.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                No steps captured yet. Add screenshot or text steps to populate the index.
              </div>
            ) : (
              activeProject.steps.map((step: SopStep, index: number) => {
                const stepNum = index + 1;
                const title = isDefaultStepTitle(step.title)
                  ? (step.title ? step.title.replace(/^Step\s+\d+/i, `Step ${stepNum}`) : `Step ${stepNum}: Action`)
                  : (step.title || `Step ${stepNum}`);

                // Estimated page: Cover = page 1, TOC = page 2, Step 1 = page 3...
                const pageNumber = cover?.enabled !== false ? index + 3 : index + 2;

                return (
                  <div
                    key={step.id}
                    onClick={() => setActiveStepId(step.id)}
                    className="group relative flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                      {/* Step Number Badge */}
                      <span className="w-6 h-6 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-bold flex items-center justify-center shrink-0 font-mono shadow-xs">
                        {stepNum}
                      </span>

                      {/* Step Title & Subtitle */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {title}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 capitalize shrink-0">
                            {step.type === 'screenshot' ? 'Visual' : 'Text'}
                          </span>
                        </div>
                        {step.description && (
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                            {stripMarkdown(step.description)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Dotted Leader & Page Indicator */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline font-mono text-zinc-300 dark:text-zinc-700 tracking-widest text-xs">
                        .....................
                      </span>
                      <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800">
                        Page {pageNumber}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <span className="text-[11px] text-zinc-400">
              Tip: Click on any step row to open and annotate its visual screenshot.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
