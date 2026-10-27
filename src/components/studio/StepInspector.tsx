import React, { useState } from 'react';
import {
  Camera,
  Crop,
  Trash2,
  Sliders,
  AlertTriangle,
  Lightbulb,
  Info,
  ChevronDown,
  Sparkles,
  BookOpen,
  ListOrdered,
  Layers,
  Building2,
  PanelRight
} from 'lucide-react';
import { useSopStore } from '../../store/useSopStore';
import { CalloutType, DEFAULT_COVER_PAGE_SETTINGS } from '../../types/sop';
import { RichInstructionsEditor } from './RichInstructionsEditor';
import { getCmdLabel } from '../../utils/platform';
import { DEFAULT_THEME } from '../../store/sampleData';

interface StepInspectorProps {
  onTriggerCapture?: (mode?: 'fullscreen' | 'selection') => void;
  width?: number;
  onToggleCollapse?: () => void;
}

export const StepInspector: React.FC<StepInspectorProps> = ({
  onTriggerCapture,
  width = 320,
  onToggleCollapse
}) => {
  const {
    activeProject,
    activeStepId,
    updateStep,
    deleteStep,
    setRetakeStepId,
    retakeStepImage,
    updateBeautifySettings,
    updateCoverPageSettings,
    updateProjectDetails
  } = useSopStore();

  const [showBeautifySettings, setShowBeautifySettings] = useState(false);
  const cmdLabel = getCmdLabel();

  if (!activeProject) return null;

  if (activeStepId === 'cover') {
    const cover = activeProject.coverPage || DEFAULT_COVER_PAGE_SETTINGS;

    return (
      <aside
        style={{ width }}
        className="border-l border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col h-full select-none shrink-0 overflow-y-auto"
      >
        <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Front Cover</span>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title={`Collapse Step Inspector (${cmdLabel}+I)`}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="p-3.5 space-y-4 text-xs">
          {/* Cover Enable */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 shadow-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Cover Page</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cover.enabled}
                onChange={(e) => updateCoverPageSettings({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Table of Contents / Index Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 shadow-xs">
            <div className="flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Index Page</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cover.showTableOfContents}
                onChange={(e) => updateCoverPageSettings({ showTableOfContents: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Background Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Background Type
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-200/60 dark:bg-zinc-800 rounded-lg">
              {(['gradient', 'color', 'image'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => updateCoverPageSettings({ backgroundType: type })}
                  className={`py-1 text-[11px] font-semibold rounded capitalize transition-all cursor-pointer ${
                    cover.backgroundType === type
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Style */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Layout Style
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['modern', 'executive', 'minimal', 'bold'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => updateCoverPageSettings({ layout: l })}
                  className={`py-1.5 px-2 rounded-md border text-center text-xs font-semibold capitalize transition-all cursor-pointer ${
                    cover.layout === l
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Front Page Details */}
          <div className="space-y-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3 h-3 text-blue-500" />
              <span>Front Page Details</span>
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Document Title</label>
                <input
                  type="text"
                  value={cover.title || activeProject.name}
                  onChange={(e) => {
                    updateCoverPageSettings({ title: e.target.value });
                    updateProjectDetails({ name: e.target.value });
                  }}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Description</label>
                <textarea
                  rows={3}
                  placeholder="What this SOP covers and who it is for..."
                  value={cover.subtitle || activeProject.description || ''}
                  onChange={(e) => {
                    updateCoverPageSettings({ subtitle: e.target.value });
                    updateProjectDetails({ description: e.target.value });
                  }}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Department / Org</label>
                <input
                  type="text"
                  placeholder="e.g. Operations, IT, QA"
                  value={activeProject.department || cover.organization || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateCoverPageSettings({ organization: val, department: val });
                    updateProjectDetails({ department: val });
                  }}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Author</label>
                <input
                  type="text"
                  value={cover.author || activeProject.author || ''}
                  onChange={(e) => {
                    updateCoverPageSettings({ author: e.target.value });
                    updateProjectDetails({ author: e.target.value });
                  }}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* Running Headers & Footers */}
          <div className="space-y-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-500" />
              <span>Running Headers & Footers</span>
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Header (All Pages)</label>
                <input
                  type="text"
                  placeholder="Defaults to Dept • SOP Title"
                  value={activeProject.headerText || ''}
                  onChange={(e) => updateProjectDetails({ headerText: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-0.5">Footer (All Pages)</label>
                <input
                  type="text"
                  placeholder="Defaults to Confidential • Dept"
                  value={activeProject.footerText || ''}
                  onChange={(e) => updateProjectDetails({ footerText: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (activeStepId === 'index') {
    const cover = activeProject.coverPage || DEFAULT_COVER_PAGE_SETTINGS;

    return (
      <aside
        style={{ width }}
        className="border-l border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col h-full select-none shrink-0 overflow-y-auto"
      >
        <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider uppercase">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Table of Contents</span>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title={`Collapse Step Inspector (${cmdLabel}+I)`}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="p-3.5 space-y-4 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 shadow-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Include Index</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cover.showTableOfContents}
                onChange={(e) => updateCoverPageSettings({ showTableOfContents: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-300">
            <span className="font-semibold block mb-1">Index Scope</span>
            <span>Lists all {activeProject.steps.length} sequential steps with visual and text indicators.</span>
          </div>
        </div>
      </aside>
    );
  }

  const currentStep = activeProject.steps.find((s) => s.id === activeStepId);

  if (!currentStep) {
    return (
      <aside
        style={{ width }}
        className="border-l border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 text-center text-xs text-zinc-400 flex flex-col justify-center select-none shrink-0"
      >
        No step selected to inspect.
      </aside>
    );
  }

  const beautify = activeProject.theme?.beautifySettings || DEFAULT_THEME.beautifySettings;

  const handleStartRetake = async (mode: 'fullscreen' | 'selection' = 'fullscreen', e?: React.MouseEvent) => {
    if (!currentStep) return;
    setRetakeStepId(currentStep.id);
    if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject && activeProject) {
      window.electronAPI.syncActiveProject(activeProject);
    }

    if (mode === 'selection') {
      if (typeof window !== 'undefined' && window.electronAPI?.triggerCapture) {
        try {
          const imagePath = await window.electronAPI.triggerCapture(true, 'selection');
          if (imagePath) {
            retakeStepImage(currentStep.id, imagePath);
            setRetakeStepId(null);
            if (window.electronAPI?.restoreStudio) {
              window.electronAPI.restoreStudio();
            }
          }
          return;
        } catch (err) {
          console.warn('Retake selection failed:', err);
        }
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

    // Full screen retake: minimize to floating pill so user can view screen and snap when ready
    if (typeof window !== 'undefined' && window.electronAPI?.minimizeToOverlay) {
      window.electronAPI.minimizeToOverlay(anchor);
    }
  };

  const handleCalloutTypeChange = (type: CalloutType | 'none') => {
    if (type === 'none') {
      updateStep(currentStep.id, { callout: undefined });
    } else {
      updateStep(currentStep.id, {
        callout: {
          type,
          text: currentStep.callout?.text || 'Enter important note or caution here...'
        }
      });
    }
  };

  return (
    <aside
      style={{ width }}
      className="border-l border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 flex flex-col h-full text-xs select-none shrink-0 overflow-hidden"
    >
      {/* Inspector Header */}
      <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          <span>Step Inspector</span>
        </span>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title={`Collapse Step Inspector (${cmdLabel}+I)`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3.5 flex-1 overflow-y-auto">
        {/* Step Title Input */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Step Title
          </label>
          <input
            type="text"
            value={currentStep.title}
            onChange={(e) => updateStep(currentStep.id, { title: e.target.value })}
            placeholder="Step title..."
            className="w-full px-2.5 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        {/* Step Instructions / Notes Rich Text Editor */}
        <RichInstructionsEditor
          value={currentStep.description}
          onChange={(newDesc) => updateStep(currentStep.id, { description: newDesc })}
          placeholder="Provide context or guidance for this step..."
          defaultHeight={190}
          stepTitle={`Step ${currentStep.order}: ${currentStep.title || 'Untitled Step'}`}
        />

        {/* Callout Badge Selector (Icon-Based with Clear Tooltips) */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
            Callout Highlight
          </label>
          <div className="grid grid-cols-4 gap-1 mb-2">
            <button
              type="button"
              onClick={() => handleCalloutTypeChange('none')}
              className={`py-1 text-xs rounded border font-medium flex items-center justify-center transition-colors cursor-pointer ${
                !currentStep.callout
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-700'
              }`}
              title="None (No callout card)"
            >
              <span className="text-[11px]">None</span>
            </button>
            <button
              type="button"
              onClick={() => handleCalloutTypeChange('tip')}
              className={`py-1 text-xs rounded border font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                currentStep.callout?.type === 'tip'
                  ? 'bg-emerald-600 text-white border-transparent shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-emerald-400 border-zinc-200 dark:border-zinc-700'
              }`}
              title="Tip: Recommended practice or guidance"
            >
              <Lightbulb className="w-3.5 h-3.5 text-emerald-500 group-hover:text-emerald-600" />
              <span className="text-[11px]">Tip</span>
            </button>
            <button
              type="button"
              onClick={() => handleCalloutTypeChange('warning')}
              className={`py-1 text-xs rounded border font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                currentStep.callout?.type === 'warning'
                  ? 'bg-amber-600 text-white border-transparent shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-amber-400 border-zinc-200 dark:border-zinc-700'
              }`}
              title="Warning: Caution or critical risk"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px]">Warn</span>
            </button>
            <button
              type="button"
              onClick={() => handleCalloutTypeChange('info')}
              className={`py-1 text-xs rounded border font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                currentStep.callout?.type === 'info'
                  ? 'bg-blue-600 text-white border-transparent shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-400 border-zinc-200 dark:border-zinc-700'
              }`}
              title="Note: Helpful information"
            >
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px]">Note</span>
            </button>
          </div>

          {currentStep.callout && (
            <input
              type="text"
              value={currentStep.callout.text}
              onChange={(e) =>
                updateStep(currentStep.id, {
                  callout: {
                    type: currentStep.callout!.type,
                    text: e.target.value
                  }
                })
              }
              placeholder="Callout note text..."
              className="w-full px-2.5 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          )}
        </div>

        {/* Screenshot Specific Controls */}
        {currentStep.type === 'screenshot' && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            {/* Retake Screenshot Section */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                Image Retake
              </label>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={(e) => handleStartRetake('fullscreen', e)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 dark:text-amber-400 font-semibold transition-colors cursor-pointer text-xs shadow-xs"
                  title={`Minimizes to floating pill so you can see your screen to retake full screen (${cmdLabel}+Shift+S)`}
                >
                  <Camera className="w-4 h-4" />
                  <span>Retake Full Screen</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleStartRetake('selection', e)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 dark:text-amber-400 font-semibold transition-colors cursor-pointer text-xs shadow-xs"
                  title={`Select a rectangular area of your screen to retake (${cmdLabel}+Shift+A)`}
                >
                  <Crop className="w-4 h-4" />
                  <span>Retake Selection</span>
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                Minimizes to floating pill so you can see your screen, and automatically reopens after capture.
              </p>
            </div>

            {/* Beautify Frame Settings Accordion */}
            <div>
              <button
                type="button"
                onClick={() => setShowBeautifySettings(!showBeautifySettings)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400 py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Beautify Frame Settings</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showBeautifySettings ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showBeautifySettings && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-md border border-zinc-200 dark:border-zinc-700/60 space-y-3 mt-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Enable Frame
                    </span>
                    <input
                      type="checkbox"
                      checked={beautify.enabled}
                      onChange={(e) =>
                        updateBeautifySettings({ enabled: e.target.checked })
                      }
                      className="rounded border-zinc-300"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                      <span>Padding</span>
                      <span>{beautify.padding}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={64}
                      value={beautify.padding}
                      onChange={(e) =>
                        updateBeautifySettings({ padding: Number(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                      <span>Border Radius</span>
                      <span>{beautify.borderRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={beautify.borderRadius}
                      onChange={(e) =>
                        updateBeautifySettings({ borderRadius: Number(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                      <span>Drop Shadow</span>
                      <span>{beautify.shadowBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={beautify.shadowBlur}
                      onChange={(e) =>
                        updateBeautifySettings({ shadowBlur: Number(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Step Footer */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
        <button
          type="button"
          onClick={() => deleteStep(currentStep.id)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors text-xs font-medium cursor-pointer"
          title={`Delete Step ${currentStep.order}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Step</span>
        </button>
      </div>
    </aside>
  );
};
