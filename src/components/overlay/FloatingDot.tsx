import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  Crop,
  Maximize2,
  X,
  Check,
  ExternalLink,
  Search,
  Copy,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useSopStore } from '../../store/useSopStore';
import { ErrorFaqItem, OcrAnalysisResult } from '../../types/sop';
import { RELEASE_FEATURES } from '../../config/releaseFeatures';
import { isMacPlatform, getCmdLabel } from '../../utils/platform';
import { renderMarkdownBlocks } from '../../utils/markdownHelper';
import { ErrorSearchModal } from '../faq/ErrorSearchModal';

type DotState =
  | 'collapsed'
  | 'mini_preview'
  | 'ocr_scanning'
  | 'error_match'
  | 'error_new'
  | 'search';

interface FloatingDotProps {
  onTriggerCapture?: () => Promise<string | null>;
}

const EXPAND_PADDING_DELTA_PX = 8; // px-1.5 (12px) -> px-2.5 (20px)

export const FloatingDot: React.FC<FloatingDotProps> = ({ onTriggerCapture }) => {
  const {
    activeProject,
    activeStepId,
    recentCapture,
    setRecentCapture,
    addStep,
    retakeStepImage,
    retakeStepId,
    setRetakeStepId,
    setActiveView,
    setActiveStepId,
    analyzeImageWithOcr,
    saveErrorFaqItem,
  } = useSopStore();

  const [dotState, setDotState] = useState<DotState>('collapsed');
  const [progressWidth, setProgressWidth] = useState(100);

  // Cursor-anchored pill expansion state
  const [isPillHovered, setIsPillHovered] = useState(false);
  const [anchorOffsetX, setAnchorOffsetX] = useState(0);
  const [labelWidths, setLabelWidths] = useState<number[]>([38, 38, 38]);

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hoverLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Drag and Drop & OCR state
  const [isDragOver, setIsDragOver] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrAnalysisResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // New Error Solution form state
  const [newErrorTitle, setNewErrorTitle] = useState('');
  const [newErrorCode, setNewErrorCode] = useState('');
  const [newErrorSolution, setNewErrorSolution] = useState('');
  const [newErrorTags, setNewErrorTags] = useState('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stepCount = activeProject?.steps.length || 0;
  const currentStep = activeProject?.steps.find((s) => s.id === activeStepId);
  const retakeStep = activeProject?.steps.find((s) => s.id === retakeStepId);
  const isRetakeMode = Boolean(retakeStepId && retakeStep);
  const isMac = isMacPlatform();
  const cmdLabel = getCmdLabel();
  const shortcutFullLabel = isMac ? '⌘⇧S' : 'Ctrl+⇧S';
  const shortcutAreaLabel = isMac ? '⌘⇧A' : 'Ctrl+⇧A';
  const shortcutSearchLabel = isMac ? '⌘⇧F' : 'Ctrl+⇧F';

  // Update overlay window size via Electron IPC
  const notifyElectronSize = useCallback((mode: DotState) => {
    if (typeof window !== 'undefined' && window.electronAPI?.setOverlaySize) {
      if (mode === 'collapsed') {
        window.electronAPI.setOverlaySize('collapsed');
      } else if (mode === 'mini_preview') {
        window.electronAPI.setOverlaySize('preview');
      } else if (mode === 'ocr_scanning' || mode === 'error_match') {
        window.electronAPI.setOverlaySize('error_match');
      } else if (mode === 'error_new') {
        window.electronAPI.setOverlaySize('error_new');
      } else if (mode === 'search') {
        window.electronAPI.setOverlaySize('search');
      } else {
        window.electronAPI.setOverlaySize('expanded');
      }
    }
  }, []);

  const transitionToState = useCallback(
    (nextState: DotState) => {
      if (hoverLeaveTimeoutRef.current) {
        clearTimeout(hoverLeaveTimeoutRef.current);
        hoverLeaveTimeoutRef.current = null;
      }
      if (nextState !== 'collapsed') {
        setIsPillHovered(false);
        setAnchorOffsetX(0);
      }
      setDotState(nextState);
      notifyElectronSize(nextState);
    },
    [notifyElectronSize]
  );

  const doCapture = useCallback(
    async (mode: 'fullscreen' | 'selection') => {
      const isRetaking = Boolean(retakeStepId);
      const targetRetakeId = retakeStepId;

      setIsPillHovered(false);
      setAnchorOffsetX(0);

      // In Electron environment, triggerCapture emits 'capture-completed' via IPC.
      // App.tsx in studioWindow is the single authoritative mutator that adds/retakes the step,
      // which automatically synchronizes to overlayWindow via syncActiveProject.
      if (typeof window !== 'undefined' && window.electronAPI?.triggerCapture) {
        try {
          const imagePath = await window.electronAPI.triggerCapture(isRetaking, mode);
          if (imagePath) {
            setRecentCapture(imagePath);
            return;
          }
        } catch (err) {
          console.warn('Capture failed:', err);
        }
      }

      // Standalone web browser fallback:
      if (onTriggerCapture) {
        const path = await onTriggerCapture();
        if (path) {
          if (isRetaking && targetRetakeId) {
            retakeStepImage(targetRetakeId, path);
            setRetakeStepId(null);
            setActiveStepId(targetRetakeId);
            setActiveView('studio');
          } else {
            addStep(path);
          }
          setRecentCapture(path);
          return;
        }
      }

      // Fallback: mock capture step
      const mockStep = addStep(
        `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" fill="%231e293b"><rect width="960" height="540" fill="%230f172a"/><text x="480" y="270" font-family="system-ui" font-size="28" fill="%23f8fafc" text-anchor="middle">Step ${stepCount + 1} Captured</text></svg>`
      );
      setRecentCapture(mockStep.image?.originalImagePath || null);
    },
    [
      retakeStepId,
      retakeStepImage,
      setRetakeStepId,
      setActiveStepId,
      setActiveView,
      addStep,
      setRecentCapture,
      onTriggerCapture,
      stepCount,
    ]
  );

  // Single data-driven configuration for expandable pill action buttons
  const pillActionButtons = useMemo(() => {
    const buttons = [
      {
        id: 'fullscreen',
        icon: Camera,
        shortcut: shortcutFullLabel,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          doCapture('fullscreen');
        },
        title:
          isRetakeMode && retakeStep
            ? `Retake full screen for Step ${retakeStep.order} (${cmdLabel}+Shift+S)`
            : `Full screen capture (${cmdLabel}+Shift+S)`,
        colorClasses: isRetakeMode
          ? 'bg-amber-950/60 border-amber-500/50 hover:bg-amber-900/60 text-amber-300'
          : 'bg-zinc-900/90 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800 text-blue-400',
      },
      {
        id: 'selection',
        icon: Crop,
        shortcut: shortcutAreaLabel,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          doCapture('selection');
        },
        title:
          isRetakeMode && retakeStep
            ? `Retake selected area for Step ${retakeStep.order} (${cmdLabel}+Shift+A)`
            : `Capture selected area (${cmdLabel}+Shift+A)`,
        colorClasses:
          'bg-zinc-900/90 border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800 text-amber-400',
      },
    ];

    if (RELEASE_FEATURES.errorFaq) {
      buttons.push({
        id: 'search',
        icon: Search,
        shortcut: shortcutSearchLabel,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          transitionToState('search');
        },
        title: `Quick Error Search HUD (${cmdLabel}+Shift+F)`,
        colorClasses:
          'bg-zinc-900/90 border-zinc-800 hover:border-purple-500/50 hover:bg-zinc-800 text-purple-400',
      });
    }

    return buttons;
  }, [
    shortcutFullLabel,
    shortcutAreaLabel,
    shortcutSearchLabel,
    isRetakeMode,
    retakeStep,
    cmdLabel,
    doCapture,
    transitionToState,
  ]);

  // Measure natural width of each shortcut badge so width animation & cursor-anchor math match to the pixel
  useLayoutEffect(() => {
    if (dotState !== 'collapsed') return;
    const measured = pillActionButtons.map((_, idx) => {
      const el = labelRefs.current[idx];
      return el && el.scrollWidth > 0 ? Math.ceil(el.scrollWidth) : isMac ? 36 : 48;
    });
    setLabelWidths((prev) =>
      prev.length === measured.length && prev.every((val, i) => val === measured[i]) ? prev : measured
    );
  }, [dotState, isMac, isRetakeMode, pillActionButtons]);

  /**
   * Computes the horizontal translation (in px) so that the pill expands outward
   * directly from the button / cursor position where the user hovered, keeping
   * the target button stationary under the cursor.
   */
  const computeAnchorOffset = useCallback(
    (clientX: number, hoveredButtonIndex?: number): number => {
      const expandableDeltas = pillActionButtons.map(
        (_, idx) => (labelRefs.current[idx]?.scrollWidth || labelWidths[idx] || 38) + EXPAND_PADDING_DELTA_PX
      );
      const deltas = [...expandableDeltas, 0]; // Restore button does not change width
      const totalDeltaW = expandableDeltas.reduce((sum, w) => sum + w, 0);

      let targetIdx = hoveredButtonIndex;
      if (targetIdx === undefined) {
        let minDistance = Infinity;
        buttonRefs.current.forEach((btn, idx) => {
          if (!btn) return;
          const rect = btn.getBoundingClientRect();
          const center = rect.left + rect.width / 2;
          const dist = Math.abs(clientX - center);
          if (dist < minDistance) {
            minDistance = dist;
            targetIdx = idx;
          }
        });
      }

      if (targetIdx === undefined) return 0;

      let expansionToLeft = 0;
      for (let i = 0; i < targetIdx; i++) {
        expansionToLeft += deltas[i] || 0;
      }

      const btnEl = buttonRefs.current[targetIdx];
      let cursorFractionInButton = 0.5;
      if (btnEl) {
        const rect = btnEl.getBoundingClientRect();
        if (rect.width > 0) {
          cursorFractionInButton = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }
      }

      const cursorShiftInsidePill = expansionToLeft + cursorFractionInButton * (deltas[targetIdx] || 0);
      return Math.round(totalDeltaW / 2 - cursorShiftInsidePill);
    },
    [labelWidths, pillActionButtons]
  );

  const handleActionZoneEnter = (clientX: number, buttonIndex?: number) => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
    if (!isPillHovered) {
      const offset = computeAnchorOffset(clientX, buttonIndex);
      setAnchorOffsetX(offset);
      setIsPillHovered(true);
    }
  };

  const handleActionZoneLeave = () => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = setTimeout(() => {
      setIsPillHovered(false);
      setAnchorOffsetX(0);
    }, 90);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    };
  }, []);

  // Sync retakeStepId from IPC if changed externally
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onRetakeStepIdChanged) {
      return window.electronAPI.onRetakeStepIdChanged((id) => {
        setRetakeStepId(id);
      });
    }
  }, [setRetakeStepId]);

  // Listen to Global Search HUD shortcut (Ctrl+Shift+F)
  useEffect(() => {
    if (!RELEASE_FEATURES.errorFaq) return;
    if (typeof window !== 'undefined' && window.electronAPI?.onOpenSearchHud) {
      return window.electronAPI.onOpenSearchHud(() => {
        transitionToState('search');
      });
    }
  }, [transitionToState]);

  // Trigger mini preview when recentCapture changes
  useEffect(() => {
    if (recentCapture) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      transitionToState('mini_preview');
      setProgressWidth(100);

      const startTime = Date.now();
      const duration = 3000;

      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgressWidth(remaining);
      }, 50);

      timerRef.current = setTimeout(() => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        transitionToState('collapsed');
        setRecentCapture(null);
      }, duration);
    }
  }, [recentCapture, setRecentCapture, transitionToState]);

  const clearPreviewTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  const handleOpenStudioForStep = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    clearPreviewTimers();
    transitionToState('collapsed');
    setRecentCapture(null);

    const currentProj = useSopStore.getState().activeProject;
    if (currentProj && currentProj.steps.length > 0) {
      const latestStep = currentProj.steps[currentProj.steps.length - 1];
      setActiveStepId(latestStep.id);
    }

    window.electronAPI?.restoreStudio?.();
    setActiveView('studio');
  };

  const handleDismissPreview = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    clearPreviewTimers();
    transitionToState('collapsed');
    setRecentCapture(null);
  };

  // =========================================================
  // Drag & Drop and Clipboard Paste for Error Screenshot OCR
  // =========================================================

  const handleDragOver = (e: React.DragEvent) => {
    if (!RELEASE_FEATURES.errorFaq) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!RELEASE_FEATURES.errorFaq) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!RELEASE_FEATURES.errorFaq) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file (PNG, JPG, WebP)');
      return;
    }

    const filePath = (file as any).path;
    if (filePath) {
      handleProcessErrorImage(filePath);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleProcessErrorImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Listen for Clipboard Paste (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!RELEASE_FEATURES.errorFaq) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = async () => {
              if (typeof reader.result === 'string') {
                handleProcessErrorImage(reader.result);
              }
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const openBlankNewErrorCard = useCallback(
    (title = 'Unspecified Error', code = '') => {
      setNewErrorTitle(title);
      setNewErrorCode(code);
      setNewErrorSolution('');
      setNewErrorTags('');
      transitionToState('error_new');
    },
    [transitionToState]
  );

  const handleProcessErrorImage = async (imagePathOrBase64: string) => {
    if (!RELEASE_FEATURES.errorFaq) return;
    clearPreviewTimers();
    transitionToState('ocr_scanning');
    setIsCopied(false);

    const scanningSafetyTimer = setTimeout(() => {
      setDotState((current) => {
        if (current === 'ocr_scanning') {
          notifyElectronSize('error_new');
          setNewErrorTitle('Unspecified Error');
          setNewErrorCode('');
          setNewErrorSolution('');
          setNewErrorTags('');
          return 'error_new';
        }
        return current;
      });
    }, 12000);

    try {
      const result = await analyzeImageWithOcr(imagePathOrBase64);
      clearTimeout(scanningSafetyTimer);
      if (!result) {
        openBlankNewErrorCard();
        return;
      }

      setOcrResult(result);

      if (result.bestMatch && result.bestMatch.confidence >= 0.45) {
        transitionToState('error_match');
      } else {
        openBlankNewErrorCard(result.detectedTitle || 'Unspecified Error', result.detectedErrorCode || '');
      }
    } catch (err) {
      clearTimeout(scanningSafetyTimer);
      console.error('OCR processing failed:', err);
      openBlankNewErrorCard();
    }
  };

  const handleCopyMatchedSolution = (solutionText: string) => {
    navigator.clipboard.writeText(solutionText);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2200);
  };

  const handleSaveNewErrorSolution = async () => {
    if (!newErrorTitle.trim()) {
      alert('Please enter an error title');
      return;
    }

    const id = `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const tags = newErrorTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const item: ErrorFaqItem = {
      id,
      title: newErrorTitle.trim(),
      errorCode: newErrorCode.trim() ? newErrorCode.trim().toUpperCase() : undefined,
      rawOcrText: ocrResult?.rawText || newErrorTitle.trim(),
      imagePath: ocrResult?.imagePath || '',
      solution: newErrorSolution.trim() || 'No solution recorded.',
      tags,
      createdAt: now,
      updatedAt: now,
      matchCount: 1,
    };

    const success = await saveErrorFaqItem(item);
    if (success) {
      if (newErrorSolution.trim()) {
        navigator.clipboard.writeText(newErrorSolution.trim());
      }
      transitionToState('collapsed');
      setOcrResult(null);
    } else {
      alert('Failed to save error solution.');
    }
  };

  const handleRestoreStudio = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRetakeStepId(null);
    window.electronAPI?.restoreStudio?.();
    setActiveView('studio');
  };

  const isAmberDot = isRetakeMode || (!activeProject && RELEASE_FEATURES.errorFaq);

  return (
    <div
      className="w-full h-full flex items-center justify-center p-2 select-none font-sans bg-transparent"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. COLLAPSED STATE: Cursor-Anchored Dynamic Capsule HUD */}
      {dotState === 'collapsed' && (
        <div
          onDoubleClick={handleRestoreStudio}
          style={{
            transform: `translate3d(${isPillHovered && !isDragOver ? anchorOffsetX : 0}px, 0, 0)`,
          }}
          className={`pill-expand-transition flex items-center h-10 bg-zinc-950/95 text-white rounded-full transition-[transform,box-shadow,border-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            isDragOver
              ? 'px-3 border-2 border-dashed border-emerald-400 bg-emerald-950/80 shadow-[0_0_24px_rgba(52,211,153,0.8),0_0_8px_#34d399] scale-105'
              : isRetakeMode
              ? 'border border-amber-500/80 shadow-[0_0_14px_rgba(245,158,11,0.7),0_0_24px_rgba(245,158,11,0.35),0_0_3px_#f59e0b]'
              : 'border border-blue-500/80 shadow-[0_0_14px_rgba(59,130,246,0.7),0_0_24px_rgba(59,130,246,0.35),0_0_3px_#3b82f6]'
          }`}
        >
          {isDragOver ? (
            <div className="flex items-center gap-2 py-0.5 px-1 text-emerald-300 font-semibold text-xs animate-pulse">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Drop Error Screenshot to Scan!</span>
            </div>
          ) : (
            <>
              {/* Dedicated Drag Handle: Status Indicator & Step Count / Standby Badge */}
              <div
                className="titlebar-drag flex items-center gap-1.5 pl-3 pr-2 h-full cursor-grab active:cursor-grabbing shrink-0"
                title={
                  isRetakeMode && retakeStep
                    ? `Retaking Step ${retakeStep.order} • Drag to reposition`
                    : activeProject
                    ? `Step ${stepCount} • Drag to reposition • Double-click to open Studio`
                    : RELEASE_FEATURES.errorFaq
                    ? 'Error & FAQ Standby • Drag to reposition • Drop screenshot to scan'
                    : 'SOP Capture Standby • Drag to reposition • Double-click to open Studio'
                }
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-35 ${
                      isAmberDot ? 'bg-amber-400' : 'bg-blue-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      isAmberDot
                        ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]'
                        : 'bg-blue-500 shadow-[0_0_6px_#3b82f6]'
                    }`}
                  />
                </span>
                <span
                  className={`font-mono text-xs font-bold tracking-tight whitespace-nowrap ${
                    isAmberDot ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {isRetakeMode && retakeStep
                    ? `Retake #${retakeStep.order}`
                    : activeProject
                    ? stepCount
                    : RELEASE_FEATURES.errorFaq
                    ? 'FAQ'
                    : 'SOP'}
                </span>
                <div className="h-3.5 w-px bg-zinc-700/80 ml-1" />
              </div>

              {/* Contiguous No-Drag Action Zone: Zero drag-region gaps to prevent Electron hover flicker */}
              <div
                onPointerEnter={(e) => handleActionZoneEnter(e.clientX)}
                onPointerLeave={handleActionZoneLeave}
                className="titlebar-no-drag flex items-center gap-1 pr-2 pl-0.5 h-full shrink-0"
              >
                {pillActionButtons.map((action, idx) => {
                  const Icon = action.icon;
                  const targetLabelWidth = labelWidths[idx] || (isMac ? 36 : 48);
                  return (
                    <button
                      key={action.id}
                      ref={(el) => {
                        buttonRefs.current[idx] = el;
                      }}
                      type="button"
                      onPointerEnter={(e) => handleActionZoneEnter(e.clientX, idx)}
                      onClick={action.onClick}
                      className={`pill-expand-transition flex items-center justify-center h-7 rounded-full border text-xs font-medium cursor-pointer shrink-0 transition-[padding,background-color,border-color,color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isPillHovered ? 'px-2.5' : 'px-1.5'
                      } ${action.colorClasses}`}
                      title={action.title}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span
                        ref={(el) => {
                          labelRefs.current[idx] = el;
                        }}
                        style={{
                          width: isPillHovered ? `${targetLabelWidth}px` : '0px',
                        }}
                        className={`pill-expand-transition inline-block overflow-hidden whitespace-nowrap font-mono text-[10px] font-semibold tracking-tight text-zinc-200 transition-[width,opacity] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          isPillHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                      >
                        <span className="pl-1.5 inline-block">{action.shortcut}</span>
                      </span>
                    </button>
                  );
                })}

                {/* Restore Studio / Library Button */}
                <button
                  ref={(el) => {
                    buttonRefs.current[pillActionButtons.length] = el;
                  }}
                  type="button"
                  onPointerEnter={(e) => handleActionZoneEnter(e.clientX, pillActionButtons.length)}
                  onClick={handleRestoreStudio}
                  className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-zinc-800 active:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  title={
                    isRetakeMode
                      ? 'Cancel retake & return to Studio'
                      : activeProject
                      ? 'Expand & Open Studio'
                      : 'Restore StepFlow'
                  }
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. MINI-PREVIEW PILL UPON CAPTURE (3-second auto-collapsing) */}
      {dotState === 'mini_preview' && (
        <div
          className="titlebar-no-drag group relative bg-zinc-950/95 text-white rounded-xl p-2.5 border border-blue-500/80 shadow-[0_0_22px_rgba(59,130,246,0.7),0_0_8px_#3b82f6] w-[295px] cursor-pointer hover:border-blue-400 transition-all overflow-hidden"
          onClick={handleOpenStudioForStep}
          title="Click to open this screenshot in the editor"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-all duration-75"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          <div className="flex items-center gap-2.5 mt-1">
            <div className="relative w-14 h-10 rounded-md bg-zinc-900 overflow-hidden shrink-0 border border-zinc-700/80 group-hover:border-blue-400 transition-colors flex items-center justify-center">
              {recentCapture || currentStep?.image?.originalImagePath ? (
                <img
                  src={recentCapture || currentStep?.image?.originalImagePath}
                  alt="Captured screenshot"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <Camera className="w-5 h-5 text-zinc-400" />
              )}
              <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/25 transition-colors flex items-center justify-center">
                <Maximize2 className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 truncate">
                  Step {stepCount} Captured
                </span>
                <span className="text-[10px] text-zinc-400 font-mono ml-1">
                  {Math.ceil(progressWidth * 0.03)}s
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 font-medium truncate mt-0.5 group-hover:text-white transition-colors">
                Click image to edit in Studio →
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleDismissPreview}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Dismiss preview"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. OCR SCANNING ANIMATION STATE */}
      {RELEASE_FEATURES.errorFaq && dotState === 'ocr_scanning' && (
        <div className="titlebar-no-drag bg-zinc-950/95 text-white rounded-2xl p-4 border border-blue-500/80 shadow-[0_0_24px_rgba(59,130,246,0.7),0_0_8px_#3b82f6] w-[340px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
              </span>
              <span className="text-xs font-bold text-white tracking-wide">
                Scanning Error Screenshot...
              </span>
            </div>
            <button
              type="button"
              onClick={() => transitionToState('collapsed')}
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3 py-1">
            <RefreshCw className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
            <p className="text-[11px] text-zinc-300 leading-snug">
              Running offline OCR on error dialog and searching knowledge base for solutions...
            </p>
          </div>
        </div>
      )}

      {/* 4. VERIFIED SOLUTION MATCH CARD */}
      {RELEASE_FEATURES.errorFaq && dotState === 'error_match' && ocrResult?.bestMatch && (
        <div className="titlebar-no-drag bg-zinc-950/95 text-white rounded-2xl p-3.5 border border-emerald-500/80 shadow-[0_0_26px_rgba(16,185,129,0.65),0_0_8px_#10b981] w-[360px] flex flex-col gap-2.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Solution Found ({Math.round(ocrResult.bestMatch.confidence * 100)}% Match)
              </span>
            </div>
            <button
              type="button"
              onClick={() => transitionToState('collapsed')}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Error Title & Code */}
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-bold text-white leading-tight">
                {ocrResult.bestMatch.item.title}
              </h3>
              {ocrResult.bestMatch.item.errorCode && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  {ocrResult.bestMatch.item.errorCode}
                </span>
              )}
            </div>

            {/* Solution Preview */}
            <div className="bg-zinc-900/90 rounded-lg p-2.5 border border-zinc-800 max-h-32 overflow-y-auto text-[11px] text-zinc-200 leading-relaxed font-sans prose prose-invert">
              {renderMarkdownBlocks(ocrResult.bestMatch.item.solution)}
            </div>
          </div>

          {/* Primary Action Button: One-Click Copy */}
          <button
            type="button"
            onClick={() => handleCopyMatchedSolution(ocrResult.bestMatch!.item.solution)}
            className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
              isCopied
                ? 'bg-emerald-600 text-white shadow-emerald-900/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-900/30 active:scale-[0.99]'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Copied to Clipboard! 🎉</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Solution to Clipboard</span>
              </>
            )}
          </button>

          {/* Secondary Actions */}
          <div className="flex items-center justify-between text-[11px] pt-1 text-zinc-400 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() =>
                openBlankNewErrorCard(
                  ocrResult.detectedTitle || 'New Error',
                  ocrResult.detectedErrorCode || ''
                )
              }
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Not this error? Add New
            </button>

            <button
              type="button"
              onClick={() => {
                transitionToState('collapsed');
                handleRestoreStudio();
              }}
              className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Open in Studio</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 5. NEW ERROR RECORDING CARD */}
      {RELEASE_FEATURES.errorFaq && dotState === 'error_new' && (
        <div className="titlebar-no-drag bg-zinc-950/95 text-white rounded-2xl p-4 border border-blue-500/80 shadow-[0_0_26px_rgba(59,130,246,0.65),0_0_8px_#3b82f6] w-[380px] flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-white">Record New Error Solution</span>
            </div>
            <button
              type="button"
              onClick={() => transitionToState('collapsed')}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">
                Error Title
              </label>
              <input
                type="text"
                value={newErrorTitle}
                onChange={(e) => setNewErrorTitle(e.target.value)}
                placeholder="Error title or symptom"
                className="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">
                  Error Code
                </label>
                <input
                  type="text"
                  value={newErrorCode}
                  onChange={(e) => setNewErrorCode(e.target.value)}
                  placeholder="e.g. 0x80040115"
                  className="w-full px-2.5 py-1 text-xs font-mono uppercase rounded-lg bg-zinc-900 border border-zinc-700 text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">
                  Tags
                </label>
                <input
                  type="text"
                  value={newErrorTags}
                  onChange={(e) => setNewErrorTags(e.target.value)}
                  placeholder="Outlook, VPN..."
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">
                Step-by-Step Verified Solution
              </label>
              <textarea
                rows={3}
                value={newErrorSolution}
                onChange={(e) => setNewErrorSolution(e.target.value)}
                placeholder="1. Open Settings > Network&#10;2. Reconnect VPN credentials."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                autoFocus
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => transitionToState('collapsed')}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveNewErrorSolution}
              disabled={!newErrorTitle.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save &amp; Copy Solution</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. SEARCH SPOTLIGHT HUD OVERLAY */}
      {RELEASE_FEATURES.errorFaq && dotState === 'search' && (
        <ErrorSearchModal
          isOpen={true}
          onClose={() => transitionToState('collapsed')}
          onAddNew={() => openBlankNewErrorCard('', '')}
        />
      )}
    </div>
  );
};
