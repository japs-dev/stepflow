import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  FileText,
  Plus,
  Layers,
  Image as ImageIcon,
  Trash2,
  GripVertical,
  RotateCcw,
  X,
  BookOpen,
  ListOrdered,
  History,
  PanelLeft
} from 'lucide-react';
import { useSopStore, isDefaultStepTitle } from '../../store/useSopStore';
import { SopStep, DEFAULT_COVER_PAGE_SETTINGS } from '../../types/sop';
import { getCmdLabel } from '../../utils/platform';

interface StepOutlineProps {
  onCaptureScreenshot?: () => void;
  width?: number;
  onToggleCollapse?: () => void;
}

export const StepOutline: React.FC<StepOutlineProps> = ({
  onCaptureScreenshot,
  width = 256,
  onToggleCollapse
}) => {
  const {
    activeProject,
    activeStepId,
    setActiveStepId,
    updateCoverPageSettings,
    updateProjectDetails,
    addStep,
    addTextStep,
    reorderSteps,
    deleteStep,
    lastDeletedStep,
    revertDeletedStep,
    clearLastDeletedStep
  } = useSopStore();

  const isDraggingRef = useRef(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);
  const [recentlyMovedStepId, setRecentlyMovedStepId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const prevStepCountRef = useRef(activeProject?.steps?.length || 0);

  // Auto-dismiss the revert toast after 6 seconds
  useEffect(() => {
    if (lastDeletedStep) {
      const timer = setTimeout(() => {
        clearLastDeletedStep();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [lastDeletedStep, clearLastDeletedStep]);

  // Autoscroll down to bottom when new steps are added beyond viewport
  useEffect(() => {
    if (!activeProject) return;
    const currentCount = activeProject.steps.length;
    if (currentCount > prevStepCountRef.current) {
      // Step was added; scroll smoothly to the bottom
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      });
    }
    prevStepCountRef.current = currentCount;
  }, [activeProject?.steps?.length]);

  // Scroll active step into view when activeStepId changes
  useEffect(() => {
    if (!activeStepId || isDraggingRef.current) return;
    requestAnimationFrame(() => {
      const activeEl = scrollContainerRef.current?.querySelector(`[data-step-id="${activeStepId}"]`);
      if (activeEl) {
        (activeEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }, [activeStepId]);

  if (!activeProject) return null;

  const handleAddScreenshotStep = async () => {
    if (onCaptureScreenshot) {
      onCaptureScreenshot();
      return;
    }
    if (typeof window !== 'undefined' && window.electronAPI?.triggerCapture) {
      try {
        await window.electronAPI.triggerCapture();
        return;
      } catch (err) {
        console.warn('Capture trigger failed:', err);
      }
    }
    addStep();
  };

  const handleAddTextStep = () => {
    addTextStep();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    isDraggingRef.current = true;
    setDraggedIndex(index);
    const step = activeProject.steps[index];
    if (step) {
      setActiveStepId(step.id);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === null || draggedIndex === index) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const position = offset < rect.height / 2 ? 'top' : 'bottom';

    if (dragOverIndex !== index || dragOverPosition !== position) {
      setDragOverIndex(index);
      setDragOverPosition(position);
    }
  };

  const handleDragLeave = (e: React.DragEvent, index: number) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverIndex === index) {
        setDragOverIndex(null);
        setDragOverPosition(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const movedStep = activeProject.steps[draggedIndex];

    if (draggedIndex !== index) {
      let targetIndex = index;
      if (draggedIndex < index) {
        targetIndex = dragOverPosition === 'bottom' ? index : Math.max(0, index - 1);
      } else {
        targetIndex = dragOverPosition === 'top' ? index : Math.min(activeProject.steps.length - 1, index + 1);
      }

      if (targetIndex !== draggedIndex && targetIndex >= 0 && targetIndex < activeProject.steps.length) {
        reorderSteps(draggedIndex, targetIndex);
        if (movedStep) {
          setActiveStepId(movedStep.id);
          setRecentlyMovedStepId(movedStep.id);
          setTimeout(() => {
            setRecentlyMovedStepId(null);
          }, 800);
        }
      }
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragOverPosition(null);

    // Keep isDraggingRef true briefly to swallow the synthetic click dispatched by the browser
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragOverPosition(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);
  };

  const cmdLabel = getCmdLabel();

  return (
    <aside
      style={{ width }}
      className="border-r border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col h-full select-none shrink-0 overflow-hidden"
    >
      {/* Sidebar Header */}
      <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider uppercase">
          <Layers className="w-3.5 h-3.5" />
          <span>Step Outline</span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title={`Collapse Step Outline (${cmdLabel}+B)`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Step Cards List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Document Front Matter Navigation */}
        <div className="space-y-1 pb-1">
          {/* Cover Page Navigation Card */}
          {(() => {
            const cover = activeProject.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
            const isCoverActive = activeStepId === 'cover';

            return (
              <div
                onClick={() => setActiveStepId('cover')}
                className={`group flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer ${
                  isCoverActive
                    ? 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {/* Thumbnail Icon */}
                <div className="w-6 h-6 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                  {cover.backgroundType === 'image' && cover.backgroundImage ? (
                    <img
                      src={cover.backgroundImage}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      style={{
                        background:
                          cover.backgroundType === 'gradient'
                            ? cover.backgroundGradient || DEFAULT_COVER_PAGE_SETTINGS.backgroundGradient
                            : cover.backgroundColor || '#0f172a'
                      }}
                      className="w-full h-full flex items-center justify-center"
                    >
                      <BookOpen className="w-3 h-3 text-white/80" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                    Front Cover
                  </span>
                  <span className="text-[10px] text-zinc-400 block truncate">
                    {cover.enabled ? 'Custom Cover • Active' : 'Cover Page • Off'}
                  </span>
                </div>

                <label
                  className="relative inline-flex h-5 w-9 items-center cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Include Front Cover in Document"
                >
                  <input
                    type="checkbox"
                    checked={cover.enabled}
                    onChange={(e) => updateCoverPageSettings({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <span className="absolute inset-0 rounded-full border border-zinc-300 bg-zinc-200 transition-colors peer-checked:border-zinc-900 peer-checked:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:peer-checked:border-zinc-200 dark:peer-checked:bg-zinc-600" />
                  <span className="absolute left-[2px] top-[2px] flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 bg-white text-[9px] font-bold text-zinc-800 shadow-sm transition-all peer-checked:left-[18px] peer-checked:border-zinc-900 dark:border-zinc-500 dark:bg-zinc-200 dark:text-zinc-900">
                    <span className="opacity-0 transition-opacity peer-checked:opacity-100">✓</span>
                  </span>
                </label>
              </div>
            );
          })()}

          {/* Table of Contents / Index Navigation Card */}
          {(() => {
            const cover = activeProject.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
            const isIndexActive = activeStepId === 'index';

            return (
              <div
                onClick={() => setActiveStepId('index')}
                className={`group flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer ${
                  isIndexActive
                    ? 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <div className="w-6 h-6 rounded border border-zinc-200 dark:border-zinc-700 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <ListOrdered className="w-3.5 h-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                    Table of Contents
                  </span>
                  <span className="text-[10px] text-zinc-400 block truncate">
                    {cover.showTableOfContents ? `Index • ${activeProject.steps.length} Steps` : 'Index • Off'}
                  </span>
                </div>

                <label
                  className="relative inline-flex h-5 w-9 items-center cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Include Table of Contents in Document"
                >
                  <input
                    type="checkbox"
                    checked={cover.showTableOfContents !== false}
                    onChange={(e) => updateCoverPageSettings({ showTableOfContents: e.target.checked })}
                    className="sr-only peer"
                  />
                  <span className="absolute inset-0 rounded-full border border-zinc-300 bg-zinc-200 transition-colors peer-checked:border-zinc-900 peer-checked:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:peer-checked:border-zinc-200 dark:peer-checked:bg-zinc-600" />
                  <span className="absolute left-[2px] top-[2px] flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 bg-white text-[9px] font-bold text-zinc-800 shadow-sm transition-all peer-checked:left-[18px] peer-checked:border-zinc-900 dark:border-zinc-500 dark:bg-zinc-200 dark:text-zinc-900">
                    <span className="opacity-0 transition-opacity peer-checked:opacity-100">✓</span>
                  </span>
                </label>
              </div>
            );
          })()}

          {(() => {
            const historyCount = activeProject.history?.length || 0;
            const isHistoryActive = activeStepId === 'history';
            const includeChangelog = activeProject.exportSettings?.includeChangelog !== false;

            return (
              <div
                onClick={() => setActiveStepId('history')}
                className={`group flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer ${
                  isHistoryActive
                    ? 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <div className="w-6 h-6 rounded border border-zinc-200 dark:border-zinc-700 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <History className="w-3.5 h-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                    SOP History
                  </span>
                  <span className="text-[10px] text-zinc-400 block truncate">
                    {historyCount} {historyCount === 1 ? 'Version' : 'Versions'} • {includeChangelog ? 'Included' : 'Off'}
                  </span>
                </div>

                <label
                  className="relative inline-flex h-5 w-9 items-center cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Include SOP History Changelog in Document"
                >
                  <input
                    type="checkbox"
                    checked={includeChangelog}
                    onChange={(e) =>
                      updateProjectDetails({
                        exportSettings: {
                          ...(activeProject.exportSettings || {}),
                          includeChangelog: e.target.checked
                        }
                      })
                    }
                    className="sr-only peer"
                  />
                  <span className="absolute inset-0 rounded-full border border-zinc-300 bg-zinc-200 transition-colors peer-checked:border-zinc-900 peer-checked:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-700 dark:peer-checked:border-zinc-200 dark:peer-checked:bg-zinc-600" />
                  <span className="absolute left-[2px] top-[2px] flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 bg-white text-[9px] font-bold text-zinc-800 shadow-sm transition-all peer-checked:left-[18px] peer-checked:border-zinc-900 dark:border-zinc-500 dark:bg-zinc-200 dark:text-zinc-900">
                    <span className="opacity-0 transition-opacity peer-checked:opacity-100">✓</span>
                  </span>
                </label>
              </div>
            );
          })()}

          <div className="flex items-center gap-2 pt-1 pb-0.5 px-1">
            <div className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
            <span className="text-[9px] uppercase tracking-wider font-semibold text-zinc-400">
              Steps ({activeProject.steps.length})
            </span>
            <div className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
          </div>
        </div>

        {activeProject.steps.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
            No steps yet. Add a screenshot or text step below.
          </div>
        ) : (
          activeProject.steps.map((step: SopStep, index: number) => {
            const isActive = activeStepId === step.id;
            const isBeingDragged = draggedIndex === index;
            const isRecentlyMoved = recentlyMovedStepId === step.id;

            return (
              <div
                key={step.id}
                data-step-id={step.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={(e) => handleDragLeave(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  if (isDraggingRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  setActiveStepId(step.id);
                }}
                className={`group relative flex items-center gap-2 p-2 rounded-md border transition-all ${
                  isRecentlyMoved
                    ? 'ring-2 ring-blue-500/80 bg-blue-50/70 dark:bg-blue-950/50 border-blue-400 shadow-sm'
                    : isActive
                    ? 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-xs'
                    : 'bg-transparent border-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                } ${
                  isBeingDragged
                    ? 'opacity-35 scale-[0.98] border-dashed border-blue-500/80 bg-blue-50/5'
                    : 'cursor-pointer'
                }`}
              >
                {/* Drag Drop Insertion Indicator Line */}
                {dragOverIndex === index && draggedIndex !== index && (
                  <div
                    className={`absolute left-0 right-0 h-0.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.9)] z-30 pointer-events-none ${
                      dragOverPosition === 'top' ? '-top-1' : '-bottom-1'
                    }`}
                  />
                )}

                {/* Drag Handle Grip Icon (visible on hover) */}
                <div
                  className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing transition-opacity shrink-0 -ml-0.5"
                  title="Drag to reorder step"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>

                {/* Step Number Badge */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {index + 1}
                </div>

                {/* Step Thumbnail / Icon */}
                <div className="w-12 h-9 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                  {step.type === 'screenshot' ? (
                    step.image?.originalImagePath ? (
                      <img
                        src={step.image.originalImagePath}
                        alt={step.title}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-zinc-400" />
                    )
                  ) : (
                    <FileText className="w-4 h-4 text-zinc-400" />
                  )}
                </div>

                {/* Title and metadata */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate block">
                      {isDefaultStepTitle(step.title)
                        ? (step.title ? step.title.replace(/^Step\s+\d+/i, `Step ${index + 1}`) : `Step ${index + 1}: Action`)
                        : (step.title || `Step ${index + 1}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-400">
                    <span className="capitalize">{step.type === 'screenshot' ? 'Visual' : 'Text'}</span>
                    {step.callout && (
                      <>
                        <span>•</span>
                        <span className="capitalize text-blue-500 font-medium">
                          {step.callout.type}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete Button on Hover (instant delete without ugly prompt) */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStep(step.id);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors cursor-pointer"
                    title={`Delete Step ${index + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Undo / Revert Toast Notification */}
      {lastDeletedStep && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-zinc-900 dark:bg-zinc-800 border border-zinc-700/80 text-zinc-100 shadow-xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-2 z-30 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] truncate text-zinc-300">
              Step {lastDeletedStep.index + 1} deleted
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={revertDeletedStep}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-xs"
              title="Revert deleted step"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Revert</span>
            </button>
            <button
              type="button"
              onClick={clearLastDeletedStep}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons: Compact segmented grid */}
      <div className="p-2 border-t border-zinc-200/80 dark:border-zinc-800/80 grid grid-cols-2 gap-1.5 bg-white dark:bg-zinc-900 shrink-0">
        <button
          onClick={handleAddScreenshotStep}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition-colors cursor-pointer shadow-xs"
          title="Capture and insert screenshot step"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>+ Snap</span>
        </button>
        <button
          onClick={handleAddTextStep}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          title="Add a text documentation step"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Text</span>
        </button>
      </div>
    </aside>
  );
};
