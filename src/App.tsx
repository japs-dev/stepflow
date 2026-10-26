import React, { useEffect, useState } from 'react';
import { useSopStore, normalizeProjectSteps } from './store/useSopStore';
import { ProjectLibrary } from './components/dashboard/ProjectLibrary';
import { StudioLayout } from './components/studio/StudioLayout';
import { FloatingDot } from './components/overlay/FloatingDot';

export const App: React.FC = () => {
  const {
    activeView,
    activeProject,
    loadProjects,
    addStep,
    setRecentCapture,
    setActiveView,
    syncActiveProjectFromExternal
  } = useSopStore();

  const [isOverlayRoute, setIsOverlayRoute] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.includes('overlay')
  );

  useEffect(() => {
    // Load initial or persisted projects
    loadProjects();

    const updateRoute = () => {
      const isOverlay = window.location.hash.includes('overlay');
      setIsOverlayRoute(isOverlay);
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('overlay-mode', isOverlay);
      }
    };

    updateRoute();
    window.addEventListener('hashchange', updateRoute);

    // 1. Connect Electron IPC listener: onCaptureCompleted
    let unsubscribeCapture: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onCaptureCompleted) {
      try {
        unsubscribeCapture = window.electronAPI.onCaptureCompleted((imagePath: string) => {
          if (imagePath) {
            const isOverlay = window.location.hash.includes('overlay');
            const state = useSopStore.getState();
            if (!isOverlay) {
              if (state.retakeStepId) {
                state.retakeStepImage(state.retakeStepId, imagePath);
                state.setRetakeStepId(null);
                state.setActiveView('studio');
              } else {
                addStep(imagePath);
              }
            } else {
              if (state.retakeStepId) {
                state.setRetakeStepId(null);
              }
            }
            setRecentCapture(imagePath);
          }
        });
      } catch (err) {
        console.warn('Failed to bind onCaptureCompleted:', err);
      }
    }

    // 2. Connect Electron IPC listener: onActiveProjectSynced
    let unsubscribeSync: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onActiveProjectSynced) {
      try {
        unsubscribeSync = window.electronAPI.onActiveProjectSynced((project) => {
          syncActiveProjectFromExternal(project);
        });
      } catch (err) {
        console.warn('Failed to bind onActiveProjectSynced:', err);
      }
    }

    // 3. Connect Electron IPC listener: onStudioRestored
    let unsubscribeRestored: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onStudioRestored) {
      try {
        unsubscribeRestored = window.electronAPI.onStudioRestored(() => {
          const currentProject = useSopStore.getState().activeProject;
          if (currentProject) {
            setActiveView('studio');
            const state = useSopStore.getState();
            const targetId = state.retakeStepId || state.activeStepId;
            const validStep = currentProject.steps.find((s) => s.id === targetId);
            if (validStep) {
              useSopStore.getState().setActiveStepId(validStep.id);
            } else if (currentProject.steps.length > 0) {
              useSopStore.getState().setActiveStepId(currentProject.steps[currentProject.steps.length - 1].id);
            }
          }
        });
      } catch (err) {
        console.warn('Failed to bind onStudioRestored:', err);
      }
    }

    // 4. Connect Electron IPC listener: onProjectFileChanged (Claude MCP live sync)
    let unsubscribeFileChanged: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onProjectFileChanged) {
      try {
        unsubscribeFileChanged = window.electronAPI.onProjectFileChanged((data) => {
          const store = useSopStore.getState();
          if (data.action === 'save' && data.project) {
            const normalizedProject = normalizeProjectSteps(data.project);
            const updated = store.projects.some((p) => p.id === data.id)
              ? store.projects.map((p) => (p.id === data.id ? normalizedProject : p))
              : [normalizedProject, ...store.projects];

            useSopStore.setState({ projects: updated });

            // If the changed project is currently open in Studio, live-update it
            if (store.activeProject?.id === data.id) {
              const currentStepId = store.activeStepId;
              const stepStillExists = normalizedProject.steps.some((s) => s.id === currentStepId);
              useSopStore.setState({
                activeProject: normalizedProject,
                activeStepId: stepStillExists
                  ? currentStepId
                  : normalizedProject.steps[0]?.id || null,
              });
            }
          } else if (data.action === 'delete') {
            const filtered = store.projects.filter((p) => p.id !== data.id);
            useSopStore.setState({ projects: filtered });
            if (store.activeProject?.id === data.id) {
              useSopStore.setState({
                activeProject: null,
                activeStepId: null,
                activeView: 'library',
              });
            }
          }
        });
      } catch (err) {
        console.warn('Failed to bind onProjectFileChanged:', err);
      }
    }

    // 5. Connect Electron IPC listener: onWorkspacePathChanged
    let unsubscribeWorkspaceChanged: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.onWorkspacePathChanged) {
      try {
        unsubscribeWorkspaceChanged = window.electronAPI.onWorkspacePathChanged(() => {
          loadProjects();
        });
      } catch (err) {
        console.warn('Failed to bind onWorkspacePathChanged:', err);
      }
    }

    return () => {
      window.removeEventListener('hashchange', updateRoute);
      if (unsubscribeCapture) unsubscribeCapture();
      if (unsubscribeSync) unsubscribeSync();
      if (unsubscribeRestored) unsubscribeRestored();
      if (unsubscribeFileChanged) unsubscribeFileChanged();
      if (unsubscribeWorkspaceChanged) unsubscribeWorkspaceChanged();
    };
  }, [loadProjects, addStep, setRecentCapture, setActiveView, syncActiveProjectFromExternal]);

  // Frameless transparent overlay window mode (routed via #/overlay)
  if (isOverlayRoute) {
    return (
      <div className="w-screen h-screen bg-transparent overflow-hidden">
        <FloatingDot />
      </div>
    );
  }

  // Standard Studio / Library view mode
  return (
    <div className="h-screen w-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      {activeView === 'studio' && activeProject ? (
        <StudioLayout />
      ) : (
        <ProjectLibrary />
      )}
    </div>
  );
};

export default App;
