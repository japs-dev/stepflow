import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Maximize2,
  Camera,
  Upload,
  Info,
  AlertTriangle,
  Lightbulb,
  PanelLeftOpen,
  PanelRightOpen,
  Minus,
  Plus,
  SlidersHorizontal,
  Crop,
  Eye
} from 'lucide-react';
import { useSopStore } from '../../store/useSopStore';
import {
  CalloutType,
  AnnotationItem,
  TextSettings,
  DEFAULT_TEXT_SETTINGS,
  LoupeSettings,
  DEFAULT_LOUPE_SETTINGS
} from '../../types/sop';
import { AnnotationToolbar, ToolType } from '../canvas/AnnotationToolbar';
import { KonvaCanvas, KonvaCanvasHandle } from '../canvas/KonvaCanvas';
import { CoverPageStudio } from './CoverPageStudio';
import { TableOfContentsStudio } from './TableOfContentsStudio';
import { SopHistoryStudio } from './SopHistoryStudio';
import { RichInstructionsEditor } from './RichInstructionsEditor';
import { renderMarkdownBlocks } from '../../utils/markdownHelper';
import { getCmdLabel } from '../../utils/platform';
import { DEFAULT_THEME } from '../../store/sampleData';

interface CenterViewportProps {
  onTriggerCapture?: (mode?: 'fullscreen' | 'selection') => void;
  leftOpen?: boolean;
  rightOpen?: boolean;
  onOpenLeft?: () => void;
  onOpenRight?: () => void;
}

export const CenterViewport: React.FC<CenterViewportProps> = ({
  onTriggerCapture,
  leftOpen = true,
  rightOpen = true,
  onOpenLeft,
  onOpenRight
}) => {
  const {
    activeProject,
    activeStepId,
    updateStep,
    retakeStepImage,
    setStepAnnotations
  } = useSopStore();

  const [zoomPercent, setZoomPercent] = useState<number>(75);
  const [showZoomMenu, setShowZoomMenu] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');

  const viewportScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const scrubStartRef = useRef<{ y: number; zoom: number; moved: boolean }>({ y: 0, zoom: 75, moved: false });

  // Annotation Canvas State
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [currentColor, setCurrentColor] = useState<string>('#2563eb');
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState<number>(3);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [textSettings, setTextSettings] = useState<TextSettings>(DEFAULT_TEXT_SETTINGS);
  const [loupeSettings, setLoupeSettings] = useState<LoupeSettings>(DEFAULT_LOUPE_SETTINGS);

  // Undo/Redo History Stack
  const [history, setHistory] = useState<AnnotationItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const canvasRef = useRef<KonvaCanvasHandle | null>(null);
  const cmdLabel = getCmdLabel();

  const currentStep = activeProject?.steps.find((s) => s.id === activeStepId);

  // Initialize history when step changes
  useEffect(() => {
    if (currentStep?.image) {
      const initial = currentStep.image.annotations || [];
      setHistory([initial]);
      setHistoryIndex(0);
      setSelectedAnnotationId(null);
    }
  }, [currentStep?.id]);

  const annotations = currentStep?.image?.annotations || [];

  // Sync text & loupe settings if user selects an annotation on canvas
  useEffect(() => {
    if (selectedAnnotationId) {
      const selectedItem = annotations.find((a) => a.id === selectedAnnotationId);
      if (selectedItem && selectedItem.type === 'text') {
        setTextSettings((prev) => ({
          fontSize: selectedItem.fontSize || prev.fontSize,
          bold: selectedItem.fontWeight === 'bold',
          italic: selectedItem.fontStyle === 'italic',
          hasBackground: selectedItem.hasBackground !== false
        }));
      } else if (selectedItem && selectedItem.type === 'zoom_loupe') {
        setLoupeSettings({
          radius: selectedItem.radius || DEFAULT_LOUPE_SETTINGS.radius,
          zoomFactor: selectedItem.zoomFactor || DEFAULT_LOUPE_SETTINGS.zoomFactor
        });
      }
    }
  }, [selectedAnnotationId, annotations]);

  const handleAnnotationsChange = useCallback(
    (newAnnotations: AnnotationItem[]) => {
      if (!currentStep) return;

      setStepAnnotations(currentStep.id, newAnnotations);

      setHistory((prevHistory) => {
        const nextHistory = prevHistory.slice(0, historyIndex + 1);
        nextHistory.push(newAnnotations);
        if (nextHistory.length > 50) {
          nextHistory.shift();
        }
        return nextHistory;
      });
      setHistoryIndex((prevIndex) => Math.min(prevIndex + 1, 49));
    },
    [currentStep, historyIndex, setStepAnnotations]
  );

  const handleTextSettingsChange = (newSettings: TextSettings) => {
    setTextSettings(newSettings);
    if (selectedAnnotationId && currentStep) {
      const selectedItem = annotations.find((a) => a.id === selectedAnnotationId);
      if (selectedItem && selectedItem.type === 'text') {
        const updated: AnnotationItem[] = annotations.map((a) =>
          a.id === selectedAnnotationId
            ? {
                ...a,
                fontSize: newSettings.fontSize,
                fontWeight: (newSettings.bold ? 'bold' : 'normal') as 'normal' | 'bold',
                fontStyle: (newSettings.italic ? 'italic' : 'normal') as 'normal' | 'italic',
                hasBackground: newSettings.hasBackground
              }
            : a
        );
        handleAnnotationsChange(updated);
      }
    }
  };

  const handleLoupeSettingsChange = (newSettings: LoupeSettings) => {
    setLoupeSettings(newSettings);
    if (selectedAnnotationId && currentStep) {
      const selectedItem = annotations.find((a) => a.id === selectedAnnotationId);
      if (selectedItem && selectedItem.type === 'zoom_loupe') {
        const updated: AnnotationItem[] = annotations.map((a) =>
          a.id === selectedAnnotationId
            ? {
                ...a,
                radius: newSettings.radius,
                zoomFactor: newSettings.zoomFactor
              }
            : a
        );
        handleAnnotationsChange(updated);
      }
    }
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && currentStep) {
      const targetIndex = historyIndex - 1;
      const targetAnnotations = history[targetIndex];
      setHistoryIndex(targetIndex);
      setStepAnnotations(currentStep.id, targetAnnotations);
    }
  }, [history, historyIndex, currentStep, setStepAnnotations]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && currentStep) {
      const targetIndex = historyIndex + 1;
      const targetAnnotations = history[targetIndex];
      setHistoryIndex(targetIndex);
      setStepAnnotations(currentStep.id, targetAnnotations);
    }
  }, [history, historyIndex, currentStep, setStepAnnotations]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedAnnotationId || !currentStep) return;
    const remaining = annotations.filter((a) => a.id !== selectedAnnotationId);
    handleAnnotationsChange(remaining);
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, currentStep, annotations, handleAnnotationsChange]);

  const handleClearAll = useCallback(() => {
    if (!currentStep) return;
    handleAnnotationsChange([]);
    setSelectedAnnotationId(null);
  }, [currentStep, handleAnnotationsChange]);

  const handleImageCropped = useCallback(
    (newImageSrc: string, updatedAnnotations: AnnotationItem[]) => {
      if (!currentStep) return;
      retakeStepImage(currentStep.id, newImageSrc);
      handleAnnotationsChange(updatedAnnotations);
      setActiveTool('select');
    },
    [currentStep, retakeStepImage, handleAnnotationsChange]
  );

  // Zoom control helpers
  const handleZoomIn = useCallback(() => {
    setZoomPercent((prev) => Math.min(200, prev + (prev < 100 ? 15 : 25)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomPercent((prev) => Math.max(25, prev - (prev <= 100 ? 15 : 25)));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoomPercent(75);
  }, []);

  // Scrubbing on the zoom badge (press and drag up/down or left/right)
  const handleScrubMouseDown = (e: React.MouseEvent) => {
    scrubStartRef.current = {
      y: e.clientY,
      zoom: zoomPercent,
      moved: false
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dy = scrubStartRef.current.y - moveEvent.clientY; // drag up = zoom in
      if (Math.abs(dy) > 2) {
        scrubStartRef.current.moved = true;
        const newZoom = Math.min(200, Math.max(25, scrubStartRef.current.zoom + Math.round(dy * 0.75)));
        setZoomPercent(newZoom);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleZoomBadgeClick = () => {
    if (scrubStartRef.current.moved) {
      scrubStartRef.current.moved = false;
      return;
    }
    setShowZoomMenu((prev) => !prev);
  };

  // Close zoom menu on click outside or escape
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    const handleGlobalEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowZoomMenu(false);
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('keydown', handleGlobalEscape);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('keydown', handleGlobalEscape);
    };
  }, []);

  // Trackpad / Mouse Wheel Zoom with Ctrl or Cmd
  useEffect(() => {
    const container = viewportScrollRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        setZoomPercent((prev) => Math.min(200, Math.max(25, prev + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (historyIndex > 0) {
          e.preventDefault();
          handleUndo();
          return;
        }
        const lastDeleted = useSopStore.getState().lastDeletedStep;
        if (lastDeleted) {
          e.preventDefault();
          useSopStore.getState().revertDeletedStep();
          return;
        }
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnotationId) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      // Zoom shortcuts: Cmd/Ctrl + Plus, Minus, 0
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomFit();
        return;
      }

      // Escape: deselect and reset to select tool
      if (e.key === 'Escape') {
        if (selectedAnnotationId || activeTool !== 'select') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setSelectedAnnotationId(null);
          setActiveTool('select');
          return;
        }
      }

      // Tool shortcuts (without modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') setActiveTool('select');
        else if (k === 'b') setActiveTool('badge');
        else if (k === 'a') setActiveTool('arrow');
        else if (k === 'r') setActiveTool('rectangle');
        else if (k === 'x') setActiveTool('blur');
        else if (k === 'z') setActiveTool('zoom_loupe');
        else if (k === 't') setActiveTool('text');
        else if (k === 'c') setActiveTool('crop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, handleUndo, handleRedo, handleDeleteSelected, handleZoomIn, handleZoomOut, handleZoomFit, activeTool]);

  // Support pasting image directly from clipboard into the active step
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (!activeStepId || activeStepId === 'cover' || activeStepId === 'index') {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = async (event) => {
            const result = event.target?.result as string;
            if (result && activeStepId) {
              let finalPath = result;
              if (typeof window !== 'undefined' && window.electronAPI?.importPastedImage) {
                try {
                  finalPath = await window.electronAPI.importPastedImage(result);
                } catch (err) {
                  console.warn('Failed to save pasted image to assets folder:', err);
                }
              }
              retakeStepImage(activeStepId, finalPath);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeStepId, retakeStepImage]);

  const getCalloutIcon = (type?: CalloutType) => {
    switch (type) {
      case 'tip':
        return <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  const getCalloutStyles = (type?: CalloutType) => {
    switch (type) {
      case 'tip':
        return 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200';
      case 'warning':
        return 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200';
      default:
        return 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200';
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  if (activeStepId === 'cover') {
    return (
      <div className="flex-1 flex flex-col bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden relative">
        {(!leftOpen || !rightOpen) && (
          <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 flex items-center justify-between text-xs select-none shrink-0 z-10">
            <div className="flex items-center gap-1.5">
              {!leftOpen && onOpenLeft && (
                <button
                  type="button"
                  onClick={onOpenLeft}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
                  title={`Expand Step Outline (${cmdLabel}+B)`}
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px] uppercase tracking-wider">
                Front Cover Page
              </span>
            </div>
            {!rightOpen && onOpenRight && (
              <button
                type="button"
                onClick={onOpenRight}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
                title={`Expand Step Inspector (${cmdLabel}+I)`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <CoverPageStudio />
      </div>
    );
  }

  if (activeStepId === 'index') {
    return (
      <div className="flex-1 flex flex-col bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden relative">
        {(!leftOpen || !rightOpen) && (
          <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 flex items-center justify-between text-xs select-none shrink-0 z-10">
            <div className="flex items-center gap-1.5">
              {!leftOpen && onOpenLeft && (
                <button
                  type="button"
                  onClick={onOpenLeft}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
                  title={`Expand Step Outline (${cmdLabel}+B)`}
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px] uppercase tracking-wider">
                Table of Contents
              </span>
            </div>
            {!rightOpen && onOpenRight && (
              <button
                type="button"
                onClick={onOpenRight}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
                title={`Expand Step Inspector (${cmdLabel}+I)`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <TableOfContentsStudio />
      </div>
    );
  }

  if (activeStepId === 'history') {
    return (
      <div className="flex-1 flex flex-col bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden relative">
        {(!leftOpen || !rightOpen) && (
          <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 flex items-center justify-between text-xs select-none shrink-0 z-10">
            <div className="flex items-center gap-1.5">
              {!leftOpen && onOpenLeft && (
                <button
                  type="button"
                  onClick={onOpenLeft}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
                  title={`Expand Step Outline (${cmdLabel}+B)`}
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px] uppercase tracking-wider">
                SOP Changelog
              </span>
            </div>
            {!rightOpen && onOpenRight && (
              <button
                type="button"
                onClick={onOpenRight}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
                title={`Expand Step Inspector (${cmdLabel}+I)`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <SopHistoryStudio />
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="flex-1 flex flex-col bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden relative select-none">
        {(!leftOpen || !rightOpen) && (
          <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 flex items-center justify-between text-xs shrink-0 z-10">
            {!leftOpen && onOpenLeft ? (
              <button
                type="button"
                onClick={onOpenLeft}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
                title={`Expand Step Outline (${cmdLabel}+B)`}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : <div />}
            {!rightOpen && onOpenRight && (
              <button
                type="button"
                onClick={onOpenRight}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
                title={`Expand Step Inspector (${cmdLabel}+I)`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-400 text-xs">
          Select a step from the outline or customize the front cover page.
        </div>
      </div>
    );
  }

  if (!activeProject) return null;

  const beautify = activeProject.theme?.beautifySettings || DEFAULT_THEME.beautifySettings;
  const primaryColor = activeProject.theme?.primaryColor || '#0f172a';
  const accentColor = activeProject.theme?.accentColor || '#0077C8';

  const cover = activeProject.coverPage;
  const hasCover = cover?.enabled !== false;
  const hasToc = hasCover && cover?.showTableOfContents !== false;
  const stepIndex = activeProject.steps.findIndex((s) => s.id === currentStep.id);
  const stepPageNum = (hasCover ? 1 : 0) + (hasToc ? 1 : 0) + (stepIndex >= 0 ? stepIndex + 1 : 1);
  const totalPages = Math.max(1, (hasCover ? 1 : 0) + (hasToc ? 1 : 0) + activeProject.steps.length);

  const defaultHeader = [
    activeProject.department || cover?.organization,
    activeProject.name,
    'Standard Operating Procedure'
  ].filter(Boolean).join(' • ');
  const runningHeader = activeProject.headerText?.trim() || defaultHeader;

  const defaultFooter = activeProject.department || cover?.organization
    ? `Confidential • ${activeProject.department || cover?.organization} • Internal Use Only`
    : 'Confidential • Internal Use Only • Generated by StepFlow';
  const runningFooter = activeProject.footerText?.trim() || defaultFooter;

  const getCalloutPreviewColors = (type?: CalloutType) => {
    switch (type) {
      case 'tip':
        return {
          bg: '#ecfdf5',
          border: '#10b981',
          text: '#065f46',
          label: 'TIP'
        };
      case 'warning':
        return {
          bg: '#fef3c7',
          border: '#f59e0b',
          text: '#92400e',
          label: 'WARNING'
        };
      case 'info':
      default:
        return {
          bg: '#eff6ff',
          border: '#3b82f6',
          text: '#1e40af',
          label: 'NOTE'
        };
    }
  };

  // Calculate next badge number
  const existingBadges = annotations
    .filter((a) => a.type === 'badge')
    .map((a) => a.badgeNumber || 0);
  const nextBadgeNumber =
    existingBadges.length > 0 ? Math.max(...existingBadges) + 1 : 1;

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        if (result && activeStepId) {
          let finalPath = result;
          if (typeof window !== 'undefined' && window.electronAPI?.importPastedImage) {
            try {
              finalPath = await window.electronAPI.importPastedImage(result);
            } catch (err) {
              console.warn('Failed to save uploaded image to assets folder:', err);
            }
          }
          retakeStepImage(activeStepId, finalPath);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-100/70 dark:bg-zinc-950/80 overflow-hidden relative">
      {/* Top Viewport Toolbar */}
      <div className="h-10 px-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 flex items-center justify-between text-xs select-none shrink-0 z-10">
        <div className="flex items-center gap-1.5">
          {!leftOpen && onOpenLeft && (
            <button
              onClick={onOpenLeft}
              className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-0.5"
              title={`Expand Step Outline (${cmdLabel}+B)`}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px] uppercase tracking-wider">
            Step {currentStep.order}: {currentStep.type === 'screenshot' ? 'Visual Step' : 'Documentation Step'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {currentStep.type === 'screenshot' && activeTab === 'edit' && (
            <>
              {/* Interactive Zoom Bar: Stepper + Scrub + Popover */}
              <div ref={zoomMenuRef} className="relative flex items-center bg-zinc-100 dark:bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-200/80 dark:border-zinc-700/60">
                {/* Zoom Out Button */}
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomPercent <= 25}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title={`Zoom Out (${cmdLabel} -)`}
                >
                  <Minus className="w-3 h-3" />
                </button>

                {/* Scrub / Clickable Zoom Badge */}
                <button
                  type="button"
                  onMouseDown={handleScrubMouseDown}
                  onClick={handleZoomBadgeClick}
                  title="Click for slider & presets, or drag up/down to zoom"
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-colors cursor-ns-resize flex items-center gap-0.5 select-none"
                >
                  <span>{zoomPercent}%</span>
                  <SlidersHorizontal className="w-2.5 h-2.5 opacity-40 ml-0.5" />
                </button>

                {/* Zoom In Button */}
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomPercent >= 200}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title={`Zoom In (${cmdLabel} +)`}
                >
                  <Plus className="w-3 h-3" />
                </button>

                {/* Fit / Reset Button */}
                <button
                  type="button"
                  onClick={handleZoomFit}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    zoomPercent === 75
                      ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                  title={`Reset to 75% (${cmdLabel} 0)`}
                >
                  <Maximize2 className="w-3 h-3" />
                </button>

                {/* Zoom Slider & Presets Popover */}
                {showZoomMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl p-3 z-50 min-w-[210px] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 text-zinc-800 dark:text-zinc-200 select-none">
                    <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                        Zoom Level
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                        {zoomPercent}%
                      </span>
                    </div>

                    {/* Interactive Slider */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 font-mono">25%</span>
                      <input
                        type="range"
                        min={25}
                        max={200}
                        step={5}
                        value={zoomPercent}
                        onChange={(e) => setZoomPercent(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-[10px] text-zinc-400 font-mono">200%</span>
                    </div>

                    {/* Preset Buttons */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      {[
                        { label: '50%', value: 50 },
                        { label: '75%', value: 75 },
                        { label: '100%', value: 100 },
                        { label: '125%', value: 125 },
                        { label: '150%', value: 150 },
                        { label: 'Fit', value: 75 }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setZoomPercent(preset.value);
                            setShowZoomMenu(false);
                          }}
                          className={`py-1 px-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer text-center ${
                            zoomPercent === preset.value
                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-center">
                      Tip: Drag badge up/down or use {cmdLabel} + / -
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Unified Mode Switcher Tabs */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                activeTab === 'edit'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {currentStep.type === 'screenshot' ? 'Edit Canvas' : 'Markdown Edit'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>PDF Page Preview</span>
            </button>
          </div>

          {!rightOpen && onOpenRight && (
            <>
              <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
              <button
                onClick={onOpenRight}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
                title={`Expand Step Inspector (${cmdLabel}+I)`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Viewport Content Canvas */}
      <div ref={viewportScrollRef} className="flex-1 overflow-auto p-4 md:p-6 flex flex-col items-center">
        {activeTab === 'preview' ? (
          /* Live A4 Document Page Preview (Matches PDF export 1:1) */
          <div className="w-full flex flex-col items-center py-2 select-text">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
              <Eye className="w-3.5 h-3.5" />
              <span>Live Step Page Preview (A4 Aspect Ratio)</span>
            </div>

            <div className="w-full max-w-[560px] aspect-[1/1.414] bg-white rounded-xl shadow-2xl overflow-hidden border border-zinc-300/80 transition-all flex flex-col justify-between relative text-zinc-900 p-8 md:p-10">
              <div className="flex-1 flex flex-col">
                {/* Running Top Header */}
                <div className="text-[10px] text-zinc-400 font-normal pb-1 truncate">
                  {runningHeader}
                </div>
                <div className="h-px bg-zinc-200 mb-6" />

                {/* Step Card Container (Matches PDF roundedRect container) */}
                <div className="rounded-lg border border-zinc-200/90 p-4 space-y-3.5 bg-white shadow-xs">
                  {/* Step Header: Badge + Title */}
                  <div className="flex items-start gap-3">
                    <div
                      style={{ backgroundColor: primaryColor }}
                      className="px-2.5 py-1 rounded-sm text-[9px] font-bold tracking-wider text-white uppercase shrink-0 font-mono shadow-xs"
                    >
                      STEP {String(currentStep.order).padStart(2, '0')}
                    </div>
                    <h2
                      style={{ color: primaryColor }}
                      className="text-sm font-bold leading-snug flex-1"
                    >
                      {currentStep.title}
                    </h2>
                  </div>

                  {/* Step Description */}
                  {currentStep.description && (
                    <div className="text-xs text-slate-700 leading-relaxed font-normal whitespace-pre-wrap">
                      {renderMarkdownBlocks(currentStep.description)}
                    </div>
                  )}

                  {/* Callout Box (Exact PDF Colors and Stripe) */}
                  {currentStep.callout && currentStep.callout.text && (() => {
                    const c = getCalloutPreviewColors(currentStep.callout.type);
                    return (
                      <div
                        style={{ backgroundColor: c.bg, borderLeftColor: c.border }}
                        className="p-2.5 rounded-md border-l-4 flex items-start gap-2 text-xs"
                      >
                        <div className="flex-1">
                          <span style={{ color: c.text }} className="font-bold mr-1.5 font-mono text-[10px] tracking-wider uppercase">
                            {c.label}:
                          </span>
                          <span style={{ color: c.text }} className="font-medium">
                            {currentStep.callout.text}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sub-Steps List */}
                  {currentStep.subSteps && currentStep.subSteps.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {currentStep.subSteps.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-900 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {sub.badgeNumber}
                          </span>
                          <span className="font-bold text-slate-800">{sub.title}</span>
                          {sub.note && <span className="text-slate-500">— {sub.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Screenshot Image with Beautify Frame (if screenshot step) */}
                  {currentStep.type === 'screenshot' && currentStep.image?.originalImagePath && (
                    <div
                      className="flex justify-center my-2 select-none"
                      style={{
                        padding: beautify.enabled ? `${Math.min(24, beautify.padding / 2)}px` : '0px',
                        backgroundColor: beautify.enabled ? beautify.backgroundColor : 'transparent',
                        backgroundImage:
                          beautify.enabled && beautify.backgroundType === 'gradient'
                            ? 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
                            : undefined,
                        borderRadius: beautify.enabled ? `${beautify.borderRadius}px` : '4px'
                      }}
                    >
                      <img
                        src={currentStep.image.annotatedCachePath || currentStep.image.originalImagePath}
                        alt={currentStep.title}
                        className="max-h-[220px] w-auto object-contain rounded border border-zinc-200"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Running Footer */}
              <div className="pt-3 border-t border-zinc-200 text-[10px] text-zinc-400 flex items-center justify-between">
                <span className="truncate max-w-[340px]">{runningFooter}</span>
                <span className="font-mono font-medium">Page {stepPageNum} of {totalPages}</span>
              </div>
            </div>
          </div>
        ) : currentStep.type === 'screenshot' ? (
          <div className="max-w-full flex flex-col items-center w-full">
            {/* If screenshot exists */}
            {currentStep.image?.originalImagePath ? (
              <div className="flex flex-col items-center w-full">
                {/* Floating Minimalist Annotation Toolbar */}
                <div className="sticky top-0 z-20 mb-4 flex justify-center">
                  <AnnotationToolbar
                    activeTool={activeTool}
                    onSelectTool={setActiveTool}
                    currentColor={currentColor}
                    onColorChange={setCurrentColor}
                    currentStrokeWidth={currentStrokeWidth}
                    onStrokeWidthChange={setCurrentStrokeWidth}
                    textSettings={textSettings}
                    onTextSettingsChange={handleTextSettingsChange}
                    loupeSettings={loupeSettings}
                    onLoupeSettingsChange={handleLoupeSettingsChange}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    hasSelection={!!selectedAnnotationId}
                    onDeleteSelected={handleDeleteSelected}
                    onClearAll={handleClearAll}
                    nextBadgeNumber={nextBadgeNumber}
                  />
                </div>

                {/* Beautify Canvas Outer Frame */}
                <div
                  className={`transition-all duration-200 select-none ${
                    beautify.enabled ? 'rounded-xl transition-shadow' : ''
                  }`}
                  style={{
                    padding: beautify.enabled ? `${beautify.padding}px` : '0px',
                    backgroundColor: beautify.enabled ? beautify.backgroundColor : 'transparent',
                    backgroundImage:
                      beautify.enabled && beautify.backgroundType === 'gradient'
                        ? 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
                        : undefined
                  }}
                >
                  {/* Image Card Container with Konva Canvas */}
                  <div
                    className="relative overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-center transition-all duration-100"
                    style={{
                      borderRadius: beautify.enabled ? `${beautify.borderRadius}px` : '4px',
                      boxShadow: beautify.enabled
                        ? `0 ${beautify.shadowBlur / 2}px ${beautify.shadowBlur}px rgba(0, 0, 0, 0.12)`
                        : 'none'
                    }}
                  >
                    <KonvaCanvas
                      ref={canvasRef}
                      imageSrc={currentStep.image.originalImagePath}
                      annotations={annotations}
                      onChangeAnnotations={handleAnnotationsChange}
                      activeTool={activeTool}
                      currentColor={currentColor}
                      currentStrokeWidth={currentStrokeWidth}
                      textSettings={textSettings}
                      loupeSettings={loupeSettings}
                      onToolUsed={(tool) => {
                        // Keep in badge mode for rapid consecutive numbering; switch for others
                        if (tool !== 'badge') {
                          setActiveTool('select');
                        }
                      }}
                      onImageCropped={handleImageCropped}
                      selectedId={selectedAnnotationId}
                      onSelectId={setSelectedAnnotationId}
                      zoomPercent={zoomPercent}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Empty Screenshot Placeholder */
              <div className="w-[640px] h-[360px] border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg flex flex-col items-center justify-center p-6 bg-white/60 dark:bg-zinc-900/60 text-center my-8">
                <Camera className="w-8 h-8 text-zinc-400 mb-2" />
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  No screenshot captured for this step
                </h4>
                <p className="text-[11px] text-zinc-400 max-w-xs mt-1 mb-4">
                  Capture a fullscreen screenshot or select a specific area, or upload an image file from your computer.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (onTriggerCapture) onTriggerCapture('fullscreen');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
                    title={`Capture full screen (${cmdLabel}+Shift+S)`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture Screen</span>
                  </button>
                  <button
                    onClick={() => {
                      if (onTriggerCapture) onTriggerCapture('selection');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-amber-500/40 hover:border-amber-500/80 bg-amber-500/10 text-amber-500 dark:text-amber-400 text-xs font-medium transition-colors cursor-pointer"
                    title={`Capture selected area (${cmdLabel}+Shift+A)`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Capture Selection</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImage}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* In-viewport Callout Preview */}
            {currentStep.callout && currentStep.callout.text && (
              <div
                className={`mt-4 w-full max-w-[820px] p-3 rounded-md border flex items-start gap-2.5 text-xs ${getCalloutStyles(
                  currentStep.callout.type
                )}`}
              >
                {getCalloutIcon(currentStep.callout.type)}
                <div className="flex-1">
                  <span className="font-semibold capitalize mr-1">
                    {currentStep.callout.type}:
                  </span>
                  <span>{currentStep.callout.text}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Text Step View */
          <div className="max-w-2xl w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm p-6 overflow-hidden flex flex-col min-h-[420px] my-4">
            <div className="flex-1 flex flex-col space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                  Step Title
                </label>
                <input
                  type="text"
                  value={currentStep.title}
                  onChange={(e) => updateStep(currentStep.id, { title: e.target.value })}
                  className="w-full text-base font-semibold px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  placeholder="e.g. Critical Safety Procedures"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <RichInstructionsEditor
                  value={currentStep.description}
                  onChange={(newDesc) =>
                    updateStep(currentStep.id, { description: newDesc })
                  }
                  placeholder="Write detailed instructions using standard Markdown (# headers, - lists, > blockquotes)..."
                  minHeight="260px"
                  label="Markdown Instructions & Documentation"
                  stepTitle={`Step ${currentStep.order}: ${currentStep.title || 'Untitled Step'}`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
