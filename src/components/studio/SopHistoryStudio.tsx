import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GitCompare, History, RotateCcw, Upload } from 'lucide-react';
import { useSopStore, calculateHistoryChangeSummary } from '../../store/useSopStore';
import { SopStep } from '../../types/sop';

interface DetailedDiff {
  added: SopStep[];
  removed: SopStep[];
  updated: SopStep[];
}

function stepSignature(step: SopStep): string {
  return JSON.stringify(step);
}

function getDetailedDiff(previousSteps: SopStep[], nextSteps: SopStep[]): DetailedDiff {
  const previousMap = new Map(previousSteps.map((step) => [step.id, step]));
  const nextMap = new Map(nextSteps.map((step) => [step.id, step]));

  const added: SopStep[] = [];
  const removed: SopStep[] = [];
  const updated: SopStep[] = [];

  for (const nextStep of nextSteps) {
    const previousStep = previousMap.get(nextStep.id);
    if (!previousStep) {
      added.push(nextStep);
      continue;
    }
    if (stepSignature(previousStep) !== stepSignature(nextStep)) {
      updated.push(nextStep);
    }
  }

  for (const previousStep of previousSteps) {
    if (!nextMap.has(previousStep.id)) {
      removed.push(previousStep);
    }
  }

  return { added, removed, updated };
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export const SopHistoryStudio: React.FC = () => {
  const {
    activeProject,
    publishProjectVersion,
    restoreProjectVersion
  } = useSopStore();

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [publishSummary, setPublishSummary] = useState('');

  const historyEntries = activeProject?.history || [];

  useEffect(() => {
    if (!historyEntries.length) {
      setSelectedEntryId(null);
      return;
    }
    if (!selectedEntryId || !historyEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(historyEntries[0].id);
    }
  }, [historyEntries, selectedEntryId]);

  const latestEntry = historyEntries[0];
  const selectedEntry = useMemo(
    () => historyEntries.find((entry) => entry.id === selectedEntryId) || null,
    [historyEntries, selectedEntryId]
  );

  const draftVsLatestSummary = useMemo(() => {
    if (!activeProject || !latestEntry) return { added: 0, removed: 0, updated: 0 };
    return calculateHistoryChangeSummary(latestEntry.snapshot.steps, activeProject.steps);
  }, [activeProject, latestEntry]);

  const selectedDiff = useMemo(() => {
    if (!selectedEntry) {
      return { added: [], removed: [], updated: [] };
    }

    const selectedIndex = historyEntries.findIndex((entry) => entry.id === selectedEntry.id);
    const previousEntry = selectedIndex >= 0 ? historyEntries[selectedIndex + 1] : undefined;

    const baseSteps = previousEntry?.snapshot.steps || [];
    const targetSteps = selectedEntry.snapshot.steps || [];
    return getDetailedDiff(baseSteps, targetSteps);
  }, [historyEntries, selectedEntry]);

  if (!activeProject) {
    return null;
  }

  const handlePublish = () => {
    const created = publishProjectVersion(publishSummary);
    if (created) {
      setPublishSummary('');
      setSelectedEntryId(created.id);
    }
  };

  const handleRestore = (historyEntryId: string, version: string) => {
    const ok = window.confirm(`Restore SOP to version ${version}? This will keep an audit entry and move current content to draft.`);
    if (!ok) return;
    restoreProjectVersion(historyEntryId);
  };

  return (
    <div className="flex-1 bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden flex">
      <aside className="w-[320px] border-r border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/90 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200 mb-3">
          <History className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold">SOP Changelog</h2>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 mb-4">
          <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Publish Summary</label>
          <textarea
            value={publishSummary}
            onChange={(e) => setPublishSummary(e.target.value)}
            placeholder="Describe what changed in this publish..."
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={handlePublish}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold px-3 py-2 hover:bg-blue-500 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Publish New Version
          </button>
        </div>

        <div className="space-y-2">
          {historyEntries.length === 0 && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
              No changelog entries yet. Publish once to create the first version snapshot.
            </div>
          )}

          {historyEntries.map((entry) => {
            const isSelected = entry.id === selectedEntryId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedEntryId(entry.id)}
                className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">v{entry.version}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{entry.changeType}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-700 dark:text-zinc-300 line-clamp-2">{entry.summary}</p>
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{formatDate(entry.createdAt)}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 p-5 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitCompare className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Current Draft vs Latest Published</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Quick change summary since the most recent published snapshot.
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-2 py-1.5">
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">+{draftVsLatestSummary.added}</div>
                <div className="text-emerald-600/90 dark:text-emerald-400/90">Added</div>
              </div>
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 px-2 py-1.5">
                <div className="font-semibold text-rose-700 dark:text-rose-300">-{draftVsLatestSummary.removed}</div>
                <div className="text-rose-600/90 dark:text-rose-400/90">Removed</div>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2 py-1.5">
                <div className="font-semibold text-amber-700 dark:text-amber-300">~{draftVsLatestSummary.updated}</div>
                <div className="text-amber-600/90 dark:text-amber-400/90">Updated</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900 p-4">
            {!selectedEntry ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Select a version to review details.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Version v{selectedEntry.version}</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {formatDate(selectedEntry.createdAt)} by {selectedEntry.author}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(selectedEntry.id, selectedEntry.version)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold px-2.5 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>
                </div>

                <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">{selectedEntry.summary}</p>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-2 py-1.5">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">+{selectedEntry.changeSummary.added}</div>
                    <div className="text-emerald-600/90 dark:text-emerald-400/90">Added</div>
                  </div>
                  <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 px-2 py-1.5">
                    <div className="font-semibold text-rose-700 dark:text-rose-300">-{selectedEntry.changeSummary.removed}</div>
                    <div className="text-rose-600/90 dark:text-rose-400/90">Removed</div>
                  </div>
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2 py-1.5">
                    <div className="font-semibold text-amber-700 dark:text-amber-300">~{selectedEntry.changeSummary.updated}</div>
                    <div className="text-amber-600/90 dark:text-amber-400/90">Updated</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Added Steps</div>
                    {selectedDiff.added.length === 0 ? (
                      <div className="text-zinc-500 dark:text-zinc-400">None</div>
                    ) : (
                      <ul className="space-y-1">
                        {selectedDiff.added.map((step) => (
                          <li key={step.id} className="text-zinc-700 dark:text-zinc-300">Step {step.order}: {step.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1">Removed Steps</div>
                    {selectedDiff.removed.length === 0 ? (
                      <div className="text-zinc-500 dark:text-zinc-400">None</div>
                    ) : (
                      <ul className="space-y-1">
                        {selectedDiff.removed.map((step) => (
                          <li key={step.id} className="text-zinc-700 dark:text-zinc-300">Step {step.order}: {step.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-amber-700 dark:text-amber-300 mb-1">Updated Steps</div>
                    {selectedDiff.updated.length === 0 ? (
                      <div className="text-zinc-500 dark:text-zinc-400">None</div>
                    ) : (
                      <ul className="space-y-1">
                        {selectedDiff.updated.map((step) => (
                          <li key={step.id} className="text-zinc-700 dark:text-zinc-300">Step {step.order}: {step.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {selectedEntry && (
          <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900 px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Snapshot includes {selectedEntry.snapshot.steps.length} steps and was saved as version {selectedEntry.snapshot.version}.
          </div>
        )}

        {/* Live Document Changelog Table Preview (Matches PDF 1:1) */}
        <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Document Changelog (Exported PDF Preview)
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Exact table formatting and change summary rendered on Document Changelog pages.
              </p>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {historyEntries.length} Published Entries
            </span>
          </div>

          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-700">
                  <th className="py-2 px-3">Change Date</th>
                  <th className="py-2 px-3">Editor</th>
                  <th className="py-2 px-3">Changed Steps</th>
                  <th className="py-2 px-3">Publish Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {historyEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-3 text-center text-zinc-400">
                      No published history yet. The initial draft will be recorded upon first publish.
                    </td>
                  </tr>
                ) : (
                  historyEntries.map((entry, idx) => {
                    const prev = historyEntries[idx + 1];
                    const diff = calculateHistoryChangeSummary(prev?.snapshot.steps || [], entry.snapshot.steps);
                    const changesParts: string[] = [];
                    if (diff.added) changesParts.push(`+${diff.added} added`);
                    if (diff.updated) changesParts.push(`~${diff.updated} updated`);
                    if (diff.removed) changesParts.push(`-${diff.removed} removed`);
                    const changeLabel = changesParts.join(', ') || 'Minor adjustments';

                    return (
                      <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-[11px]">
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {entry.author || activeProject.author || 'Team Member'}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                            {changeLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-200 font-medium">
                          {entry.summary || 'Updated SOP content'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
