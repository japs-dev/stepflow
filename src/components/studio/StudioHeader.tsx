import React, { useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Download,
  Minimize2,
  ChevronDown,
  Check,
  FileCode,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
  Crop,
  FileText,
  Package
} from 'lucide-react';
import { useSopStore, flushPendingProjectBroadcast } from '../../store/useSopStore';
import { SopProject } from '../../types/sop';
import { exportToPdf, exportToPptx, exportToHtml, exportToMarkdown } from '../../utils/exporters';
import { isMacPlatform, getCmdLabel } from '../../utils/platform';

interface StudioHeaderProps {
  onTriggerCapture?: (mode?: 'fullscreen' | 'selection') => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  onTriggerCapture
}) => {
  const {
    activeProject,
    selectProject,
    updateProjectDetails,
    saveCurrentProject,
    activeStepId,
    setRetakeStepId
  } = useSopStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(activeProject?.name || '');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  if (!activeProject) return null;

  const handleTitleSubmit = () => {
    if (titleValue.trim() && titleValue !== activeProject.name) {
      updateProjectDetails({ name: titleValue.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleStatusChange = (status: SopProject['status']) => {
    updateProjectDetails({ status });
    setShowStatusMenu(false);
  };

  const handleMinimizeToDot = (e?: React.MouseEvent) => {
    flushPendingProjectBroadcast();
    let anchor: { x: number; y: number } | undefined;
    if (e?.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      anchor = {
        x: Math.round(window.screenX + rect.left + rect.width / 2),
        y: Math.round(window.screenY + rect.top + rect.height / 2),
      };
    } else if (e && typeof e.screenX === 'number' && e.screenX > 0) {
      anchor = { x: e.screenX, y: e.screenY };
    }

    if (typeof window !== 'undefined' && window.electronAPI?.minimizeToOverlay) {
      if (window.electronAPI.syncActiveProject && activeProject) {
        window.electronAPI.syncActiveProject(activeProject);
      }
      window.electronAPI.minimizeToOverlay(anchor);
    }
  };

  const handleRetakeActive = (mode: 'fullscreen' | 'selection' = 'fullscreen', e?: React.MouseEvent) => {
    if (!activeStepId) return;
    flushPendingProjectBroadcast();
    setRetakeStepId(activeStepId);
    if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject && activeProject) {
      window.electronAPI.syncActiveProject(activeProject);
    }

    if (mode === 'selection') {
      if (typeof window !== 'undefined' && window.electronAPI?.triggerCapture) {
        window.electronAPI.triggerCapture(true, 'selection').catch(console.warn);
        return;
      }
      if (onTriggerCapture) {
        onTriggerCapture('selection');
        return;
      }
    }

    let anchor: { x: number; y: number } | undefined;
    if (e?.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      anchor = {
        x: Math.round(window.screenX + rect.left + rect.width / 2),
        y: Math.round(window.screenY + rect.top + rect.height / 2),
      };
    }

    // Full screen retake: minimize to floating pill so screen is unobstructed
    if (typeof window !== 'undefined' && window.electronAPI?.minimizeToOverlay) {
      window.electronAPI.minimizeToOverlay(anchor);
    }
  };

  const handleExport = async (type: 'pdf' | 'pptx' | 'html' | 'markdown' | 'bundle') => {
    setShowExportMenu(false);
    setExportFeedback(`Exporting ${type.toUpperCase()}...`);
    try {
      let res: { success: boolean; filePath?: string; error?: string } = { success: false };
      if (type === 'pdf') {
        res = await exportToPdf(activeProject);
      } else if (type === 'pptx') {
        res = await exportToPptx(activeProject);
      } else if (type === 'html') {
        res = await exportToHtml(activeProject);
      } else if (type === 'markdown') {
        exportToMarkdown(activeProject);
        res = { success: true };
      } else if (type === 'bundle') {
        if (typeof window !== 'undefined' && window.electronAPI?.exportProjectBundle) {
          res = await window.electronAPI.exportProjectBundle(activeProject);
        } else {
          res = { success: false, error: 'Desktop export bundle not supported in browser mode' };
        }
      }

      if (res.success) {
        setExportFeedback('Exported successfully!');
      } else if (res.error === 'Export canceled by user') {
        setExportFeedback(null);
      } else {
        setExportFeedback(`Export failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Export failed:', err);
      setExportFeedback('Export failed');
    }

    setTimeout(() => {
      setExportFeedback(null);
    }, 3500);
  };

  const isMac = isMacPlatform();
  const cmdLabel = getCmdLabel();

  const statusColors = {
    draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
    in_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60',
    published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
  };

  const statusLabels = {
    draft: 'Draft',
    in_review: 'In Review',
    published: 'Published'
  };

  return (
    <header className={`titlebar-drag h-12 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm ${isMac ? 'pl-20' : 'pl-3'} pr-3 flex items-center justify-between select-none relative z-50 shrink-0`}>
      {/* Left Toolbar: Back & Title */}
      <div className="titlebar-no-drag flex items-center gap-2">
        <button
          onClick={() => {
            saveCurrentProject();
            selectProject(null);
          }}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Back to SOP Projects"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

        {/* Project Name editable */}
        {isEditingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setTitleValue(activeProject.name);
                setIsEditingTitle(false);
              }
            }}
            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 focus:outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              setTitleValue(activeProject.name);
              setIsEditingTitle(true);
            }}
            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 px-2 py-1 rounded transition-colors text-left flex items-center gap-1.5 group cursor-pointer"
            title="Click to rename project"
          >
            <span>{activeProject.name}</span>
            <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 font-normal">
              Edit
            </span>
          </button>
        )}

        {/* Status Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[activeProject.status]} transition-colors cursor-pointer`}
          >
            <span>{statusLabels[activeProject.status]}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showStatusMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowStatusMenu(false)}
              />
              <div className="absolute left-0 mt-1 w-32 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1 z-50 text-xs">
                {(['draft', 'in_review', 'published'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                  >
                    <span>{statusLabels[st]}</span>
                    {activeProject.status === st && (
                      <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Toolbar: Inspector Toggle & Minimal Action Icons */}
      <div className="titlebar-no-drag flex items-center gap-1.5">
        {exportFeedback && (
          <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 animate-pulse mr-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {exportFeedback}
          </span>
        )}

        {/* Retake Fullscreen Button */}
        <button
          onClick={(e) => handleRetakeActive('fullscreen', e)}
          disabled={!activeStepId}
          className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors disabled:opacity-30 cursor-pointer"
          title={`Retake full screen for current step (${cmdLabel}+Shift+S)`}
        >
          <Camera className="w-4 h-4" />
        </button>

        {/* Retake Area Selection Button */}
        <button
          onClick={(e) => handleRetakeActive('selection', e)}
          disabled={!activeStepId}
          className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-amber-500/90 hover:text-amber-500 transition-colors disabled:opacity-30 cursor-pointer"
          title={`Retake selected area for current step (${cmdLabel}+Shift+A)`}
        >
          <Crop className="w-4 h-4" />
        </button>

        {/* Export Dropdown (Icon-Only + Chevron) */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
            title="Export SOP Document (PDF, PowerPoint, HTML)"
          >
            <Download className="w-4 h-4" />
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showExportMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute right-0 mt-1 w-44 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-red-500" />
                  <span>PDF Document (.pdf)</span>
                </button>
                <button
                  onClick={() => handleExport('pptx')}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <Presentation className="w-3.5 h-3.5 text-amber-500" />
                  <span>PowerPoint (.pptx)</span>
                </button>
                <button
                  onClick={() => handleExport('html')}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-500" />
                  <span>Interactive HTML (.html)</span>
                </button>
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Markdown (.md)</span>
                </button>
                <button
                  onClick={() => handleExport('bundle')}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                  title="Export a standalone portable bundle (.stepflow) including all screenshots"
                >
                  <Package className="w-3.5 h-3.5 text-indigo-500" />
                  <span>StepFlow Archive (.stepflow)</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Minimize to Dot Button (Icon-Only) */}
        <button
          onClick={handleMinimizeToDot}
          className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 transition-colors shadow-xs cursor-pointer"
          title="Minimize to Floating Overlay Dot"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
