import React, { useState, useEffect, useCallback } from 'react';
import { StudioHeader } from './StudioHeader';
import { StepOutline } from './StepOutline';
import { CenterViewport } from './CenterViewport';
import { StepInspector } from './StepInspector';
import { useSopStore } from '../../store/useSopStore';

interface StudioLayoutProps {
  onTriggerCapture?: () => void;
}

export const StudioLayout: React.FC<StudioLayoutProps> = ({ onTriggerCapture }) => {
  const {
    activeProject,
    activeStepId,
    setActiveStepId,
    saveCurrentProject
  } = useSopStore();

  // Collapsible & Adjustable Sidepanels State
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(256);
  const [rightWidth, setRightWidth] = useState(288);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentProject();
        return;
      }

      // Cmd/Ctrl + B or Cmd/Ctrl + 1: Toggle Left Outline
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === '1')) {
        e.preventDefault();
        setLeftOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl + I or Cmd/Ctrl + 2: Toggle Right Inspector
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === '2')) {
        e.preventDefault();
        setRightOpen((prev) => !prev);
        return;
      }

      // Step navigation using ArrowUp / ArrowDown when not typing
      if (!isInput && activeProject && activeProject.steps.length > 0) {
        const currentIndex = activeProject.steps.findIndex((s) => s.id === activeStepId);
        if (e.key === 'ArrowUp' && currentIndex > 0) {
          e.preventDefault();
          setActiveStepId(activeProject.steps[currentIndex - 1].id);
        } else if (e.key === 'ArrowDown' && currentIndex < activeProject.steps.length - 1) {
          e.preventDefault();
          setActiveStepId(activeProject.steps[currentIndex + 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProject, activeStepId, setActiveStepId, saveCurrentProject]);

  // Drag-to-resize Left Outline Handler
  const handleLeftResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = leftWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(180, Math.min(420, startWidth + delta));
        setLeftWidth(newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [leftWidth]
  );

  // Drag-to-resize Right Inspector Handler
  const handleRightResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(220, Math.min(460, startWidth + delta));
        setRightWidth(newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [rightWidth]
  );

  if (!activeProject) {
    return null;
  }

  const handleCapture = async (mode: 'fullscreen' | 'selection' = 'fullscreen') => {
    if (typeof window !== 'undefined' && window.electronAPI?.triggerCapture) {
      try {
        const isRetake = Boolean(useSopStore.getState().retakeStepId);
        await window.electronAPI.triggerCapture(isRetake, mode);
        return;
      } catch (err) {
        console.warn('Capture error:', err);
      }
    }
    if (onTriggerCapture) {
      onTriggerCapture();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 font-sans overflow-hidden">
      {/* Top Header with streamlined icons and layout controls */}
      <StudioHeader
        onTriggerCapture={handleCapture}
      />

      {/* 3-Pane Adjustable & Collapsible Editor Layout */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Sidebar: Step Outline */}
        {leftOpen && (
          <>
            <StepOutline
              width={leftWidth}
              onCaptureScreenshot={handleCapture}
              onToggleCollapse={() => setLeftOpen(false)}
            />
            {/* Left Resizer Divider */}
            <div
              onMouseDown={handleLeftResizeStart}
              className="w-1.5 -ml-1 z-20 hover:bg-blue-500/70 active:bg-blue-600 cursor-col-resize transition-colors select-none shrink-0"
              title="Drag to resize Step Outline"
            />
          </>
        )}

        {/* Center Viewport: Expands seamlessly to fill available space */}
        <CenterViewport
          onTriggerCapture={handleCapture}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          onOpenLeft={() => setLeftOpen(true)}
          onOpenRight={() => setRightOpen(true)}
        />

        {/* Right Inspector: Contextual step details */}
        {rightOpen && (
          <>
            {/* Right Resizer Divider */}
            <div
              onMouseDown={handleRightResizeStart}
              className="w-1.5 -mr-1 z-20 hover:bg-blue-500/70 active:bg-blue-600 cursor-col-resize transition-colors select-none shrink-0"
              title="Drag to resize Step Inspector"
            />
            <StepInspector
              width={rightWidth}
              onTriggerCapture={handleCapture}
              onToggleCollapse={() => setRightOpen(false)}
            />
          </>
        )}
      </div>
    </div>
  );
};
