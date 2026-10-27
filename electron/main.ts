import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  dialog,
  protocol,
  net,
  systemPreferences,
  shell,
  nativeImage,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { pathToFileURL } from 'url';
import JSZip from 'jszip';
import type { SopProject, ErrorFaqItem, OcrAnalysisResult } from '../src/types/sop';
import { RELEASE_FEATURES } from '../src/config/releaseFeatures';

// Register custom protocol for local asset streaming with CORS enabled
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'stepflow-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let studioWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let isCapturing = false;
let lastActiveProject: SopProject | null = null;
let currentRetakeStepId: string | null = null;
let isAppQuitting = false;

app.on('before-quit', () => {
  isAppQuitting = true;
});

if (app.isPackaged) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    appendRuntimeLog('[App] Another instance is already running in production - quitting');
    app.quit();
  }
}

function appendRuntimeLog(message: string, error?: unknown): void {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, 'runtime.log');
    const timestamp = new Date().toISOString();
    const errorText = error
      ? ` | ${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error)}`
      : '';
    fs.appendFileSync(logPath, `[${timestamp}] ${message}${errorText}\n`, 'utf-8');
  } catch {
    // Ignore logging errors to avoid blocking startup
  }
}

if (process.platform === 'win32') {
  // Defensive startup flags for environments where hardware acceleration fails.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

// Determine storage paths with configurable workspace directory support
interface StepFlowConfig {
  customStorageDir?: string | null;
}

let customStorageDir: string | null = null;

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'stepflow_config.json');
}

function loadConfig(): void {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw) as StepFlowConfig;
      if (data.customStorageDir && fs.existsSync(data.customStorageDir)) {
        customStorageDir = data.customStorageDir;
      }
    }
  } catch (err) {
    console.warn('[Config] Failed to load config:', err);
  }
}

function saveConfig(): void {
  try {
    const configPath = getConfigPath();
    const config: StepFlowConfig = { customStorageDir };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Config] Failed to save config:', err);
  }
}

function getWorkspaceRoot(): string {
  if (customStorageDir && fs.existsSync(customStorageDir)) {
    return customStorageDir;
  }
  return app.getPath('userData');
}

const getAssetsDir = (): string => path.join(getWorkspaceRoot(), 'stepflow_assets');
const getProjectsDir = (): string => path.join(getWorkspaceRoot(), 'projects');
const getErrorCatalogDir = (): string => path.join(getWorkspaceRoot(), 'error_catalog');

function toStepflowAssetUrl(filePath: string): string {
  const safePath = filePath.replace(/\\/g, '/');
  return `stepflow-asset://local/${encodeURIComponent(safePath)}`;
}

function resolveStepflowAssetPath(urlOrPath: string): string {
  let raw = (urlOrPath || '').trim();
  if (raw.startsWith('file://')) {
    try {
      raw = decodeURIComponent(raw.replace(/^file:\/\//i, ''));
    } catch {
      raw = raw.replace(/^file:\/\//i, '');
    }
  } else if (raw.startsWith('stepflow-asset://')) {
    raw = raw.replace(/^stepflow-asset:\/\//i, '');
    if (raw.toLowerCase().startsWith('local/')) {
      raw = raw.slice('local/'.length);
    }
    const queryIdx = raw.indexOf('?');
    if (queryIdx !== -1) raw = raw.slice(0, queryIdx);
    const hashIdx = raw.indexOf('#');
    if (hashIdx !== -1) raw = raw.slice(0, hashIdx);

    raw = raw.replace(/^\/+/, '');
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // Keep raw if not percent-encoded
    }
  }

  if (process.platform === 'win32') {
    raw = raw.replace(/^\/+([a-zA-Z]:)/, '$1');
    if (/^[a-zA-Z]:/.test(raw)) {
      raw = raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  } else {
    if (raw && !raw.startsWith('/')) {
      const candidateWithSlash = `/${raw}`;
      if (fs.existsSync(candidateWithSlash) || candidateWithSlash.startsWith(getAssetsDir())) {
        raw = candidateWithSlash;
      }
    }
  }

  if (path.isAbsolute(raw)) {
    return path.resolve(raw);
  }
  return path.resolve(getAssetsDir(), raw);
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.gif',
  '.ico',
  '.bmp',
]);

function isSafeAssetFile(filePath: string): boolean {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return false;
    }
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const realTarget = fs.realpathSync(filePath);
    const allowedAssets = fs.existsSync(getAssetsDir())
      ? fs.realpathSync(getAssetsDir())
      : path.resolve(getAssetsDir());
    const allowedWorkspace = fs.existsSync(getWorkspaceRoot())
      ? fs.realpathSync(getWorkspaceRoot())
      : path.resolve(getWorkspaceRoot());

    const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
    const targetNorm = norm(realTarget);
    const assetsNorm = norm(allowedAssets);
    const wsNorm = norm(allowedWorkspace);

    const isInside = (baseNorm: string) =>
      targetNorm === baseNorm || targetNorm.startsWith(`${baseNorm}${path.sep}`);

    return isInside(assetsNorm) || isInside(wsNorm);
  } catch {
    return false;
  }
}

const recentlySavedByApp = new Set<string>();
const saveSuppressionTimers = new Map<string, NodeJS.Timeout>();
let projectWatcher: fs.FSWatcher | null = null;
const debounceTimers = new Map<string, NodeJS.Timeout>();

function setupProjectsFileWatcher(): void {
  try {
    if (projectWatcher) {
      projectWatcher.close();
      projectWatcher = null;
    }
    const dir = getProjectsDir();
    if (!fs.existsSync(dir)) return;

    projectWatcher = fs.watch(dir, (eventType, filename) => {
      if (!filename || !filename.endsWith('.json') || filename.includes('.tmp')) {
        return;
      }

      const filePath = path.join(dir, filename);
      if (recentlySavedByApp.has(filePath)) {
        return;
      }

      const existingTimer = debounceTimers.get(filename);
      if (existingTimer) clearTimeout(existingTimer);

      debounceTimers.set(
        filename,
        setTimeout(async () => {
          debounceTimers.delete(filename);
          try {
            const exists = fs.existsSync(filePath);
            if (exists) {
              const raw = await fs.promises.readFile(filePath, 'utf-8');
              const project = JSON.parse(raw) as SopProject;
              if (project && project.id) {
                studioWindow?.webContents.send('project-file-changed', {
                  id: project.id,
                  action: 'save',
                  project,
                });
              }
            } else {
              const id = filename.replace(/^proj_/, '').replace(/\.json$/, '');
              studioWindow?.webContents.send('project-file-changed', {
                id,
                action: 'delete',
              });
            }
          } catch (err) {
            // Transient read/parse error
          }
        }, 150)
      );
    });

    projectWatcher.on('error', (err) => {
      console.warn('[ProjectsWatcher] File watcher encountered an error:', err);
    });
  } catch (err) {
    console.error('[ProjectsWatcher] Failed to start watcher:', err);
  }
}

async function ensureDirectories(): Promise<void> {
  await fs.promises.mkdir(getAssetsDir(), { recursive: true });
  await fs.promises.mkdir(getProjectsDir(), { recursive: true });
  await fs.promises.mkdir(getErrorCatalogDir(), { recursive: true });
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const enableRendererSandbox = process.platform !== 'win32';

function requestSelectionRect(display: Electron.Display): Promise<SelectionRect | null> {
  return new Promise((resolve) => {
    let resolved = false;

    const selectorWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      movable: false,
      resizable: false,
      focusable: true,
      show: false,
      backgroundColor: '#00000001',
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: enableRendererSandbox,
      },
    });

    const cleanupAndClose = () => {
      try {
        if (!selectorWindow.isDestroyed()) {
          selectorWindow.close();
        }
      } catch {}
    };

    const finish = (value: SelectionRect | null) => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener('selection-rect-submit', onSubmit);
      ipcMain.removeListener('selection-rect-cancel', onCancel);
      resolve(value);
    };

    const onSubmit = (event: Electron.IpcMainEvent, rect: SelectionRect) => {
      if (event.sender === selectorWindow.webContents) {
        finish(rect);
        cleanupAndClose();
      }
    };

    const onCancel = (event: Electron.IpcMainEvent) => {
      if (event.sender === selectorWindow.webContents) {
        finish(null);
        cleanupAndClose();
      }
    };

    ipcMain.on('selection-rect-submit', onSubmit);
    ipcMain.on('selection-rect-cancel', onCancel);

    selectorWindow.on('closed', () => {
      finish(null);
    });

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        cursor: crosshair;
        background: rgba(15, 23, 42, 0.2);
        user-select: none;
      }
      #hint {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.88);
        color: #e2e8f0;
        font-family: Segoe UI, Arial, sans-serif;
        font-size: 12px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        pointer-events: none;
      }
      #selection {
        position: fixed;
        border: 2px solid #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        display: none;
        box-shadow: 0 0 0 99999px rgba(2, 6, 23, 0.4);
      }
    </style>
  </head>
  <body>
    <div id="hint">Drag to capture a region. Press Esc to cancel.</div>
    <div id="selection"></div>
    <script>
      const api = window.electronAPI;
      const selectionEl = document.getElementById('selection');
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let currentY = 0;

      function rectFromPoints() {
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        return { x: left, y: top, width, height };
      }

      function renderRect() {
        const r = rectFromPoints();
        selectionEl.style.display = 'block';
        selectionEl.style.left = r.x + 'px';
        selectionEl.style.top = r.y + 'px';
        selectionEl.style.width = r.width + 'px';
        selectionEl.style.height = r.height + 'px';
      }

      window.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        currentX = e.clientX;
        currentY = e.clientY;
        renderRect();
      });

      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        currentX = e.clientX;
        currentY = e.clientY;
        renderRect();
      });

      window.addEventListener('mouseup', (e) => {
        if (!dragging) return;
        dragging = false;
        currentX = e.clientX;
        currentY = e.clientY;
        const rect = rectFromPoints();
        if (rect.width < 4 || rect.height < 4) {
          api && api.cancelSelectionRect && api.cancelSelectionRect();
          return;
        }
        api && api.submitSelectionRect && api.submitSelectionRect(rect);
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          api && api.cancelSelectionRect && api.cancelSelectionRect();
        }
      });

      window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        api && api.cancelSelectionRect && api.cancelSelectionRect();
      });
    </script>
  </body>
</html>
`;

    selectorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    selectorWindow.once('ready-to-show', () => {
      selectorWindow.show();
      selectorWindow.focus();
    });
  });
}

function loadRoute(win: BrowserWindow, route: string): void {
  const normalizedRoute = route.startsWith('#')
    ? route
    : `#${route.startsWith('/') ? route : `/${route}`}`;

  if (process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL.replace(/\/+$/, '');
    win.loadURL(`${devServerUrl}/${normalizedRoute}`);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    win.loadFile(indexPath, { hash: normalizedRoute.replace(/^#/, '') });
  }
}

function applyWindowSecurity(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (process.env.VITE_DEV_SERVER_URL && navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL)) {
      return;
    }
    if (navigationUrl.startsWith('file://')) {
      return;
    }
    event.preventDefault();
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    appendRuntimeLog(`[Renderer lvl=${level}] ${message} (${sourceId}:${line})`);
    if (level >= 2) {
      console.error(`[Renderer error] ${message} (${sourceId}:${line})`);
    } else {
      console.log(`[Renderer] ${message}`);
    }
  });
}

function getMcpServerPath(): string {
  const candidates = [
    path.join(__dirname, 'mcp-server.js'),
    path.join(__dirname, 'electron', 'mcp-server.js'),
    path.join(app.getAppPath(), 'dist-electron', 'electron', 'mcp-server.js'),
    path.join(app.getAppPath(), 'dist-electron', 'mcp-server.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(app.getAppPath(), 'dist-electron', 'electron', 'mcp-server.js');
}

function getPreloadPath(): string {
  const direct = path.join(__dirname, 'preload.js');
  if (fs.existsSync(direct)) return direct;
  const inElectronSubdir = path.join(__dirname, 'electron', 'preload.js');
  if (fs.existsSync(inElectronSubdir)) return inElectronSubdir;
  const inParentDir = path.join(__dirname, '..', 'preload.js');
  if (fs.existsSync(inParentDir)) return inParentDir;
  return direct;
}

function createStudioWindow(): BrowserWindow {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.show();
    studioWindow.focus();
    return studioWindow;
  }

  const showImmediately = process.platform === 'win32';

  studioWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'StepFlow - SOP Creator',
    show: showImmediately,
    frame: process.platform === 'darwin' ? false : true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: enableRendererSandbox,
      backgroundThrottling: false,
    },
  });

  applyWindowSecurity(studioWindow);

  // Failsafe: ensure the window still appears if ready-to-show never fires.
  const showFallbackTimer = setTimeout(() => {
    if (studioWindow && !studioWindow.isDestroyed() && !studioWindow.isVisible()) {
      appendRuntimeLog('[Window] ready-to-show timeout reached, forcing show()');
      studioWindow.show();
      studioWindow.focus();
    }
  }, 8000);

  studioWindow.once('ready-to-show', () => {
    clearTimeout(showFallbackTimer);
    appendRuntimeLog('[Window] ready-to-show fired');
    studioWindow?.show();
    studioWindow?.focus();
  });

  studioWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendRuntimeLog(
      `[Window] did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`
    );
    if (studioWindow && !studioWindow.isDestroyed() && !studioWindow.isVisible()) {
      studioWindow.show();
      studioWindow.focus();
    }
  });

  studioWindow.webContents.on('render-process-gone', (_event, details) => {
    appendRuntimeLog(
      `[Window] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  studioWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !isAppQuitting) {
      e.preventDefault();
      studioWindow?.hide();
    }
  });

  studioWindow.on('closed', () => {
    clearTimeout(showFallbackTimer);
    studioWindow = null;
    if (process.platform !== 'darwin') {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.close();
      }
      app.quit();
    }
  });

  loadRoute(studioWindow, '#/studio');

  if (showImmediately) {
    studioWindow.show();
    studioWindow.focus();
  }

  return studioWindow;
}

function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const enableRendererSandbox = process.platform !== 'win32';

  overlayWindow = new BrowserWindow({
    width: 520,
    height: 84,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: enableRendererSandbox,
      backgroundThrottling: false,
    },
  });

  applyWindowSecurity(overlayWindow);

  // Ensure floating level above standard windows
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  overlayWindow.webContents.on('did-finish-load', () => {
    if (lastActiveProject && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('active-project-synced', lastActiveProject);
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  loadRoute(overlayWindow, '#/overlay');
  return overlayWindow;
}

function setOverlayMode(mode: 'collapsed' | 'expanded' | 'preview' | 'error_match' | 'error_new' | 'search'): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const modeSizes: Record<'collapsed' | 'expanded' | 'preview' | 'error_match' | 'error_new' | 'search', { width: number; height: number }> = {
    collapsed: { width: 520, height: 84 },
    expanded: { width: 380, height: 280 },
    preview: { width: 340, height: 180 },
    error_match: { width: 430, height: 380 },
    error_new: { width: 500, height: 620 },
    search: { width: 540, height: 460 },
  };

  const target = modeSizes[mode] || modeSizes.collapsed;
  const currentBounds = overlayWindow.getBounds();

  // Find the active display nearest to overlay
  const currentDisplay = screen.getDisplayNearestPoint({
    x: currentBounds.x + Math.floor(currentBounds.width / 2),
    y: currentBounds.y + Math.floor(currentBounds.height / 2),
  });
  const workArea = currentDisplay.workArea;

  // Anchor dynamically to current corner
  const displayMidX = workArea.x + workArea.width / 2;
  const displayMidY = workArea.y + workArea.height / 2;

  let newX = currentBounds.x;
  if (currentBounds.x > displayMidX) {
    // Right anchor
    newX = currentBounds.x + currentBounds.width - target.width;
  }

  let newY = currentBounds.y;
  if (currentBounds.y > displayMidY) {
    // Bottom anchor
    newY = currentBounds.y + currentBounds.height - target.height;
  }

  // Clamp within workArea limits with padding
  const padding = 8;
  if (newX + target.width > workArea.x + workArea.width - padding) {
    newX = workArea.x + workArea.width - target.width - padding;
  }
  if (newY + target.height > workArea.y + workArea.height - padding) {
    newY = workArea.y + workArea.height - target.height - padding;
  }
  if (newX < workArea.x + padding) {
    newX = workArea.x + padding;
  }
  if (newY < workArea.y + padding) {
    newY = workArea.y + padding;
  }

  overlayWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: target.width,
    height: target.height,
  });
}

async function performCapture(isRetake = false, mode: 'fullscreen' | 'selection' = 'fullscreen'): Promise<string | null> {
  if (isCapturing) {
    console.warn('[Capture] Another capture is currently in progress');
    return null;
  }
  isCapturing = true;

  let overlayWasVisible = false;
  let studioWasVisible = false;

  try {
    const assetsDir = getAssetsDir();
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const filename = `step_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
    const filePath = path.join(assetsDir, filename);

    // Hide windows temporarily so they are not captured in the screenshot
    overlayWasVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }

    studioWasVisible = Boolean(studioWindow && !studioWindow.isDestroyed() && studioWindow.isVisible());
    if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.hide();
    }

    if (overlayWasVisible || studioWasVisible) {
      // Allow window manager compositor to flush
      await new Promise((resolve) => setTimeout(resolve, 140));
    }

    let captureSuccess = false;
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const scaleFactor = activeDisplay.scaleFactor || 1;
    let selectedRectDip: SelectionRect | null = null;

    appendRuntimeLog(
      `[Capture] start mode=${mode} isRetake=${String(Boolean(isRetake || currentRetakeStepId))} displayId=${activeDisplay.id} cursor=(${cursorPoint.x},${cursorPoint.y}) displayBounds=(${activeDisplay.bounds.x},${activeDisplay.bounds.y},${activeDisplay.bounds.width}x${activeDisplay.bounds.height}) scale=${scaleFactor}`
    );

    if (mode === 'selection' && process.platform !== 'darwin') {
      selectedRectDip = await requestSelectionRect(activeDisplay);
      if (!selectedRectDip) {
        appendRuntimeLog('[Capture] selection cancelled before screenshot');
        if (isRetake || currentRetakeStepId) {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.hide();
          }
          if (studioWindow && !studioWindow.isDestroyed()) {
            if (studioWindow.isMinimized()) studioWindow.restore();
            studioWindow.show();
            studioWindow.focus();
            studioWindow.webContents.send('studio-restored');
          }
          currentRetakeStepId = null;
        } else {
          if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.showInactive();
          }
          if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
            if (studioWindow.isMinimized()) studioWindow.restore();
            studioWindow.show();
            studioWindow.focus();
          }
        }
        return null;
      }

      appendRuntimeLog(
        `[Capture] selection rect dip=(${selectedRectDip.x},${selectedRectDip.y},${selectedRectDip.width}x${selectedRectDip.height})`
      );
    }

    // Strategy 1 (macOS): Native screencapture CLI
    if (process.platform === 'darwin') {
      try {
        // -i: interactive (selection), -s: mouse selection mode, -x: mute sound
        const screencaptureArgs = mode === 'selection' ? ['-i', '-s', '-x', filePath] : ['-x', filePath];
        const nativeSuccess = await new Promise<boolean>((resolve) => {
          execFile('/usr/sbin/screencapture', screencaptureArgs, (err) => {
            if (err) {
              // User cancelled interactive selection with Escape
              resolve(false);
            } else {
              const fileReady = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
              resolve(fileReady);
            }
          });
        });

        if (nativeSuccess) {
          captureSuccess = true;
        } else if (mode === 'selection') {
          // If interactive selection was cancelled by user, restore windows
          if (isRetake || currentRetakeStepId) {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.hide();
            }
            if (studioWindow && !studioWindow.isDestroyed()) {
              if (studioWindow.isMinimized()) studioWindow.restore();
              studioWindow.show();
              studioWindow.focus();
              studioWindow.webContents.send('studio-restored');
            }
            currentRetakeStepId = null;
          } else {
            if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.showInactive();
            }
            if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
              if (studioWindow.isMinimized()) studioWindow.restore();
              studioWindow.show();
              studioWindow.focus();
            }
          }
          return null;
        }
      } catch (nativeErr) {
        console.warn('[Capture] Native screencapture exception:', nativeErr);
      }
    }

    // Strategy 2: Electron desktopCapturer (for Windows, Linux, or macOS fallback)
    if (!captureSuccess) {
      try {
        const captureWidth = Math.round(activeDisplay.size.width * scaleFactor);
        const captureHeight = Math.round(activeDisplay.size.height * scaleFactor);

        appendRuntimeLog(
          `[Capture] desktopCapturer requested size=${captureWidth}x${captureHeight} mode=${mode}`
        );

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: captureWidth,
            height: captureHeight,
          },
          fetchWindowIcons: false,
        });

        if (sources && sources.length > 0) {
          let targetSource = sources.find((s) => s.display_id === String(activeDisplay.id));
          if (!targetSource) {
            targetSource = sources.find((s) => s.id.includes(String(activeDisplay.id)));
          }
          if (!targetSource) {
            targetSource = sources[0];
          }

          let imgBuffer = targetSource.thumbnail.toPNG();
          if (imgBuffer && imgBuffer.length > 0) {
            if (mode === 'selection' && selectedRectDip) {
              const image = nativeImage.createFromBuffer(imgBuffer);
              const imageSize = image.getSize();
              const cropX = Math.max(0, Math.floor(selectedRectDip.x * scaleFactor));
              const cropY = Math.max(0, Math.floor(selectedRectDip.y * scaleFactor));
              const cropWidth = Math.min(
                imageSize.width - cropX,
                Math.max(1, Math.floor(selectedRectDip.width * scaleFactor))
              );
              const cropHeight = Math.min(
                imageSize.height - cropY,
                Math.max(1, Math.floor(selectedRectDip.height * scaleFactor))
              );

              if (cropWidth > 1 && cropHeight > 1) {
                appendRuntimeLog(
                  `[Capture] crop applied px=(${cropX},${cropY},${cropWidth}x${cropHeight}) source=${imageSize.width}x${imageSize.height}`
                );
                imgBuffer = image.crop({ x: cropX, y: cropY, width: cropWidth, height: cropHeight }).toPNG();
              } else {
                appendRuntimeLog(
                  `[Capture] crop skipped due to tiny region px=(${cropX},${cropY},${cropWidth}x${cropHeight})`
                );
              }
            }

            await fs.promises.writeFile(filePath, imgBuffer);
            captureSuccess = true;
            appendRuntimeLog(`[Capture] saved file=${filePath}`);
          }
        }
      } catch (capturerErr) {
        console.warn('[Capture] desktopCapturer failed:', capturerErr);
        appendRuntimeLog('[Capture] desktopCapturer failed', capturerErr);
      }
    }

    // Strategy 3: Graceful fallback if screen recording permission is missing on macOS
    if (!captureSuccess) {
      console.warn('[Capture] Both capture methods failed. Checking macOS Screen Recording permission...');
      
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus ? systemPreferences.getMediaAccessStatus('screen') : 'unknown';
        if (status !== 'granted') {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Screen Recording Permission Required',
            message: 'macOS requires Screen Recording permission for StepFlow to capture your screen.',
            detail: 'Please open System Settings > Privacy & Security > Screen Recording, and enable access for StepFlow (or Terminal / IDE).',
            buttons: ['Open System Settings', 'Later'],
            defaultId: 0,
          }).then(({ response }) => {
            if (response === 0) {
              shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }
          });
        }
      }

      // Generate a clean placeholder image so the user's workflow is never broken
      const svgFallback = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#0f172a"/><rect x="80" y="60" width="800" height="420" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/><circle cx="480" cy="210" r="40" fill="#2563eb"/><text x="480" y="222" font-family="system-ui" font-size="32" fill="#ffffff" text-anchor="middle">📷</text><text x="480" y="290" font-family="system-ui" font-weight="bold" font-size="20" fill="#f8fafc" text-anchor="middle">Screen Capture Placeholder</text><text x="480" y="325" font-family="system-ui" font-size="14" fill="#94a3b8" text-anchor="middle">Screen recording permission needed in macOS System Settings</text><text x="480" y="355" font-family="system-ui" font-size="12" fill="#60a5fa" text-anchor="middle">Privacy &amp; Security &gt; Screen Recording</text></svg>`;
      const fallbackDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgFallback)}`;

      if (!isRetake) {
        if (studioWindow && !studioWindow.isDestroyed()) {
          studioWindow.webContents.send('capture-completed', fallbackDataUri);
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('capture-completed', fallbackDataUri);
        }
      }

      if (isRetake || currentRetakeStepId) {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
        if (studioWindow && !studioWindow.isDestroyed()) {
          if (studioWindow.isMinimized()) studioWindow.restore();
          studioWindow.show();
          studioWindow.focus();
          studioWindow.webContents.send('studio-restored');
        }
        currentRetakeStepId = null;
      } else {
        if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.showInactive();
        }
        if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
          if (studioWindow.isMinimized()) studioWindow.restore();
          studioWindow.show();
          studioWindow.focus();
        }
      }

      return fallbackDataUri;
    }

    // Send a canonical host+path asset URL so standard URL parsing works across macOS and Windows.
    const capturePayload = toStepflowAssetUrl(filePath);

    // Broadcast capture-completed event to all active windows
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send('capture-completed', capturePayload);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('capture-completed', capturePayload);
    }

    // If this was a retake capture, automatically restore Studio window and focus
    if (isRetake || currentRetakeStepId) {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
      if (studioWindow && !studioWindow.isDestroyed()) {
        if (studioWindow.isMinimized()) studioWindow.restore();
        studioWindow.show();
        studioWindow.focus();
        studioWindow.webContents.send('studio-restored');
      }
      currentRetakeStepId = null;
    } else {
      if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive();
      }
      if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
        if (studioWindow.isMinimized()) studioWindow.restore();
        studioWindow.show();
        studioWindow.focus();
      }
    }

    return capturePayload;
  } catch (error) {
    console.error('[Capture] Exception during screen capture:', error);
    if (isRetake || currentRetakeStepId) {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
      if (studioWindow && !studioWindow.isDestroyed()) {
        if (studioWindow.isMinimized()) studioWindow.restore();
        studioWindow.show();
        studioWindow.focus();
        studioWindow.webContents.send('studio-restored');
      }
      currentRetakeStepId = null;
    } else {
      if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.isVisible()) {
        overlayWindow.showInactive();
      }
      if (studioWasVisible && studioWindow && !studioWindow.isDestroyed()) {
        if (studioWindow.isMinimized()) studioWindow.restore();
        studioWindow.show();
        studioWindow.focus();
      }
    }
    return null;
  } finally {
    isCapturing = false;
  }
}

function registerGlobalShortcuts(): void {
  // Full screen capture shortcut: Cmd/Ctrl+Shift+S
  const fullShortcut = 'CommandOrControl+Shift+S';
  const success = globalShortcut.register(fullShortcut, async () => {
    try {
      await performCapture(Boolean(currentRetakeStepId), 'fullscreen');
    } catch (err) {
      console.error('[Shortcut] Error in full screen shortcut capture:', err);
    }
  });

  if (!success) {
    console.warn(`[Shortcut] Registration failed for ${fullShortcut}`);
  }

  // Area / Selection capture shortcut: Cmd/Ctrl+Shift+A
  const selectionShortcut = 'CommandOrControl+Shift+A';
  const selSuccess = globalShortcut.register(selectionShortcut, async () => {
    try {
      await performCapture(Boolean(currentRetakeStepId), 'selection');
    } catch (err) {
      console.error('[Shortcut] Error in selection shortcut capture:', err);
    }
  });

  if (!selSuccess) {
    console.warn(`[Shortcut] Registration failed for ${selectionShortcut}`);
  }

  if (RELEASE_FEATURES.errorFaq) {
    // Quick Search HUD shortcut: Cmd/Ctrl+Shift+F
    const searchShortcut = 'CommandOrControl+Shift+F';
    const searchSuccess = globalShortcut.register(searchShortcut, () => {
      try {
        if (studioWindow && !studioWindow.isDestroyed()) {
          if (studioWindow.isMinimized()) studioWindow.restore();
          studioWindow.show();
          studioWindow.focus();
          studioWindow.webContents.send('open-search-hud');
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('open-search-hud');
        }
      } catch (err) {
        console.error('[Shortcut] Error in search HUD shortcut:', err);
      }
    });

    if (!searchSuccess) {
      console.warn(`[Shortcut] Registration failed for ${searchShortcut}`);
    }
  }
}

async function showSaveDialogHelper(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  if (studioWindow && !studioWindow.isDestroyed()) {
    return await dialog.showSaveDialog(studioWindow, options);
  }
  return await dialog.showSaveDialog(options);
}

async function showOpenDialogHelper(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  if (studioWindow && !studioWindow.isDestroyed()) {
    return await dialog.showOpenDialog(studioWindow, options);
  }
  return await dialog.showOpenDialog(options);
}

// =========================================================
// Error & FAQ Knowledge Base + Offline OCR Engine
// =========================================================

let ocrWorkerInstance: any = null;
let ocrWorkerInitPromise: Promise<any> | null = null;

function emitOcrStatus(status: {
  phase: 'preparing' | 'initializing' | 'recognizing' | 'matching' | 'complete' | 'error';
  progress: number;
  message: string;
}): void {
  const payload = {
    ...status,
    progress: Math.max(0, Math.min(1, status.progress || 0)),
  };

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('ocr-status', payload);
  }
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.webContents.send('ocr-status', payload);
  }
}

async function getOcrWorker(): Promise<any> {
  if (!RELEASE_FEATURES.errorFaq) {
    throw new Error('OCR is disabled in Release 1');
  }
  if (ocrWorkerInstance) return ocrWorkerInstance;
  if (ocrWorkerInitPromise) return await ocrWorkerInitPromise;

  ocrWorkerInitPromise = (async () => {
    appendRuntimeLog('[OCR] Initializing bundled Tesseract worker...');
    const { createWorker } = await import('tesseract.js');

    const possibleDirs = [
      app.isPackaged ? process.resourcesPath : '',
      app.getAppPath(),
      process.cwd(),
      __dirname,
      path.join(__dirname, '..'),
    ].filter(Boolean);

    let localTrainedDataDir: string | undefined;
    for (const dir of possibleDirs) {
      if (fs.existsSync(path.join(dir, 'eng.traineddata'))) {
        localTrainedDataDir = dir;
        break;
      }
    }

    const workerOptions: Record<string, any> = {};
    if (localTrainedDataDir) {
      workerOptions.langPath = localTrainedDataDir;
      workerOptions.gzip = false;
      appendRuntimeLog(`[OCR] Using offline traineddata from: ${localTrainedDataDir}`);
    }

    const worker = await createWorker('eng', 1, workerOptions);
    ocrWorkerInstance = worker;
    appendRuntimeLog('[OCR] Tesseract worker ready');
    return worker;
  })();

  return await ocrWorkerInitPromise;
}

function extractErrorCode(text: string): string | undefined {
  if (!text) return undefined;
  // 1. Hex codes: e.g. 0x80040115, 0x80070005
  const hexMatch = text.match(/\b0x[0-9a-fA-F]{4,10}\b/);
  if (hexMatch) return hexMatch[0];

  // 2. ERR_ or ERROR_ prefixed: e.g. ERR_CONNECTION_TIMED_OUT
  const errMatch = text.match(/\b(?:ERR|ERROR)[_-][A-Z0-9_-]{3,30}\b/i);
  if (errMatch) return errMatch[0].toUpperCase();

  // 3. Application error codes: e.g. SAP-1049, ORA-00942, HTTP-403
  const appMatch = text.match(/\b[A-Z]{2,6}[-_][0-9]{3,6}\b/);
  if (appMatch) return appMatch[0].toUpperCase();

  // 4. Labeled code: "Error Code: 404"
  const labeledMatch = text.match(/\b(?:Error\s*Code|Status\s*Code|Error\s*#|Code)[\s:#]+([0-9A-Za-z_-]{2,15})\b/i);
  if (labeledMatch && labeledMatch[1]) return labeledMatch[1];

  return undefined;
}

function extractErrorTitle(text: string, errorCode?: string): string {
  if (!text || !text.trim()) return 'Unspecified Error';

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && !/^[^a-zA-Z0-9]+$/.test(l));

  // Look for a line containing "error", "failed", "exception", "warning", "unable"
  const triggerLine = lines.find((l) =>
    /(error|failed|failure|exception|warning|unable|denied|cannot|timeout|problem)/i.test(l)
  );

  if (triggerLine) {
    return triggerLine.length > 60 ? triggerLine.slice(0, 57) + '...' : triggerLine;
  }

  if (lines[0]) {
    const first = lines[0];
    return first.length > 60 ? first.slice(0, 57) + '...' : first;
  }

  return errorCode ? `Error ${errorCode}` : 'Detected Error Dialog';
}

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return new Set(words);
}

function calculateFuzzyMatch(rawText: string, errorCode: string | undefined, item: ErrorFaqItem): number {
  if (errorCode && item.errorCode && errorCode.toLowerCase() === item.errorCode.toLowerCase()) {
    return 0.95;
  }

  const queryTokens = tokenize(rawText);
  if (queryTokens.size === 0) return 0;

  const itemTokens = tokenize(`${item.title} ${item.errorCode || ''} ${item.rawOcrText} ${item.tags.join(' ')}`);
  if (itemTokens.size === 0) return 0;

  let common = 0;
  for (const token of queryTokens) {
    if (itemTokens.has(token)) common++;
  }

  const similarity = (2 * common) / (queryTokens.size + itemTokens.size);
  return Math.min(1, Math.max(0, similarity));
}

async function listErrorFaqItems(): Promise<ErrorFaqItem[]> {
  try {
    await ensureDirectories();
    const catalogDir = getErrorCatalogDir();
    const files = await fs.promises.readdir(catalogDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.includes('.tmp'));
    const items: ErrorFaqItem[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(catalogDir, file);
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        const item = JSON.parse(raw) as ErrorFaqItem;
        if (item && item.id) items.push(item);
      } catch (err) {
        console.warn(`[ErrorCatalog] Failed to parse ${file}:`, err);
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    return items;
  } catch (err) {
    console.error('[ErrorCatalog] Failed to list items:', err);
    return [];
  }
}

async function saveErrorFaqItem(item: ErrorFaqItem): Promise<boolean> {
  try {
    if (!item || !item.id) return false;
    await ensureDirectories();
    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const catalogDir = getErrorCatalogDir();
    const filePath = path.join(catalogDir, `err_${safeId}.json`);
    const tempPath = path.join(catalogDir, `err_${safeId}.${Date.now()}.tmp`);

    const now = new Date().toISOString();
    if (!item.createdAt) item.createdAt = now;
    item.updatedAt = now;

    await fs.promises.writeFile(tempPath, JSON.stringify(item, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, filePath);
    return true;
  } catch (err) {
    console.error('[ErrorCatalog] Failed to save item:', err);
    return false;
  }
}

async function deleteErrorFaqItem(id: string): Promise<boolean> {
  try {
    if (!id) return false;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(getErrorCatalogDir(), `err_${safeId}.json`);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[ErrorCatalog] Failed to delete item:', err);
    return false;
  }
}

async function importPastedImageHelper(base64Data: string): Promise<string> {
  await ensureDirectories();
  const commaIdx = base64Data.indexOf(',');
  const raw = commaIdx !== -1 ? base64Data.slice(commaIdx + 1) : base64Data;
  const buffer = Buffer.from(raw, 'base64');
  let ext = '.png';
  const match = base64Data.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (match) {
    const mimeSub = match[1].toLowerCase();
    if (mimeSub === 'jpeg' || mimeSub === 'jpg') ext = '.jpg';
    else if (mimeSub === 'webp') ext = '.webp';
    else if (mimeSub === 'gif') ext = '.gif';
    else if (mimeSub === 'svg' || mimeSub === 'svg+xml') ext = '.svg';
  }
  const filename = `paste_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
  const filePath = path.join(getAssetsDir(), filename);
  await fs.promises.writeFile(filePath, buffer);
  return toStepflowAssetUrl(filePath);
}

async function analyzeImageWithOcr(imagePathOrBase64: string): Promise<OcrAnalysisResult> {
  await ensureDirectories();
  const assetsDir = getAssetsDir();
  emitOcrStatus({ phase: 'preparing', progress: 0.06, message: 'Preparing image input...' });

  let targetFilePath = imagePathOrBase64.startsWith('data:image/')
    ? imagePathOrBase64
    : resolveStepflowAssetPath(imagePathOrBase64);
  let imageBuffer: Buffer | null = null;

  if (imagePathOrBase64.startsWith('data:image/')) {
    const base64Data = imagePathOrBase64.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(base64Data, 'base64');
    const filename = `error_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`;
    targetFilePath = path.join(assetsDir, filename);
    await fs.promises.writeFile(targetFilePath, imageBuffer);
    emitOcrStatus({ phase: 'preparing', progress: 0.16, message: 'Saved dropped image for OCR...' });
  } else if (!fs.existsSync(targetFilePath)) {
    throw new Error(`File not found: ${targetFilePath}`);
  } else {
    if (!targetFilePath.startsWith(assetsDir)) {
      const ext = path.extname(targetFilePath) || '.png';
      const filename = `error_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
      const dest = path.join(assetsDir, filename);
      await fs.promises.copyFile(targetFilePath, dest);
      targetFilePath = dest;
      emitOcrStatus({ phase: 'preparing', progress: 0.16, message: 'Copied image into workspace...' });
    }
    imageBuffer = await fs.promises.readFile(targetFilePath);
  }

  appendRuntimeLog(`[OCR] Starting recognition on ${targetFilePath}`);
  const worker = await getOcrWorker();
  const result = await worker.recognize(imageBuffer || targetFilePath);
  const rawText = (result?.data?.text || '').trim();
  appendRuntimeLog(`[OCR] Completed recognition, extracted ${rawText.length} chars`);

  const detectedErrorCode = extractErrorCode(rawText);
  const detectedTitle = extractErrorTitle(rawText, detectedErrorCode);

  const items = await listErrorFaqItems();
  let bestMatch: { item: ErrorFaqItem; confidence: number } | undefined = undefined;

  for (const item of items) {
    const score = calculateFuzzyMatch(rawText, detectedErrorCode, item);
    if (score >= 0.45) {
      if (!bestMatch || score > bestMatch.confidence) {
        bestMatch = { item, confidence: Math.round(score * 100) / 100 };
      }
    }
  }

  emitOcrStatus({ phase: 'complete', progress: 1, message: bestMatch ? 'Match found. Preparing solution card...' : 'No confident match found. Opening add-solution form...' });

  return {
    rawText,
    detectedTitle,
    detectedErrorCode,
    imagePath: targetFilePath,
    bestMatch,
  };
}

const projectSaveQueues = new Map<string, Promise<boolean>>();

function queueProjectSave(projectId: string, fn: () => Promise<boolean>): Promise<boolean> {
  const previous = projectSaveQueues.get(projectId) || Promise.resolve(true);
  const next = previous
    .catch(() => true)
    .then(fn);
  projectSaveQueues.set(projectId, next);
  next.finally(() => {
    if (projectSaveQueues.get(projectId) === next) {
      projectSaveQueues.delete(projectId);
    }
  });
  return next;
}

async function cleanupOrphanedAssets(): Promise<void> {
  try {
    await ensureDirectories();
    const assetsDir = getAssetsDir();
    const projectsDir = getProjectsDir();
    if (!fs.existsSync(assetsDir) || !fs.existsSync(projectsDir)) return;

    // 1. Gather all referenced asset filenames from all projects
    const referencedFiles = new Set<string>();

    if (lastActiveProject) {
      if (Array.isArray(lastActiveProject.steps)) {
        for (const s of lastActiveProject.steps) {
          if (s.image?.originalImagePath) {
            const resolved = resolveStepflowAssetPath(s.image.originalImagePath);
            referencedFiles.add(path.basename(resolved).toLowerCase());
          }
        }
      }
      if (lastActiveProject.coverPage?.backgroundImage) {
        const resolvedCover = resolveStepflowAssetPath(lastActiveProject.coverPage.backgroundImage);
        referencedFiles.add(path.basename(resolvedCover).toLowerCase());
      }
    }

    const projectFiles = await fs.promises.readdir(projectsDir).catch(() => []);
    for (const pf of projectFiles) {
      if (!pf.endsWith('.json')) continue;
      try {
        const raw = await fs.promises.readFile(path.join(projectsDir, pf), 'utf-8');
        const proj = JSON.parse(raw) as SopProject;
        if (proj && Array.isArray(proj.steps)) {
          for (const s of proj.steps) {
            if (s.image?.originalImagePath) {
              const resolved = resolveStepflowAssetPath(s.image.originalImagePath);
              referencedFiles.add(path.basename(resolved).toLowerCase());
            }
          }
        }
        if (proj?.coverPage?.backgroundImage) {
          const resolvedCover = resolveStepflowAssetPath(proj.coverPage.backgroundImage);
          referencedFiles.add(path.basename(resolvedCover).toLowerCase());
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // 2. Also check error catalog if enabled
    if (RELEASE_FEATURES.errorFaq) {
      const errDir = getErrorCatalogDir();
      if (fs.existsSync(errDir)) {
        const errFiles = await fs.promises.readdir(errDir).catch(() => []);
        for (const ef of errFiles) {
          if (!ef.endsWith('.json')) continue;
          try {
            const raw = await fs.promises.readFile(path.join(errDir, ef), 'utf-8');
            const item = JSON.parse(raw) as ErrorFaqItem;
            if (item?.imagePath) {
              const resolved = resolveStepflowAssetPath(item.imagePath);
              referencedFiles.add(path.basename(resolved).toLowerCase());
            }
          } catch {}
        }
      }
    }

    // 3. Inspect stepflow_assets directory and safely unlink unreferenced items older than 1 hour
    const existingAssets = await fs.promises.readdir(assetsDir).catch(() => []);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const asset of existingAssets) {
      if (referencedFiles.has(asset.toLowerCase())) continue;
      const fullPath = path.join(assetsDir, asset);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.mtimeMs < oneHourAgo) {
          await fs.promises.unlink(fullPath).catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[AssetCleanup] Background cleanup note:', err);
  }
}

function registerIpcHandlers(): void {
  // Capture & Hotkeys
  ipcMain.handle('trigger-capture', async (_event, isRetake?: boolean, mode: 'fullscreen' | 'selection' = 'fullscreen'): Promise<string | null> => {
    return await performCapture(Boolean(isRetake), mode);
  });

  // Window Management
  ipcMain.on('minimize-to-overlay', (_event, anchor?: { x: number; y: number }) => {
    let targetX: number | undefined;
    let targetY: number | undefined;

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      createOverlayWindow();
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const bounds = overlayWindow.getBounds();
      const primaryDisplay = screen.getPrimaryDisplay();

      if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        // Center the overlay pill right where the minimize button was clicked
        targetX = Math.round(anchor.x - bounds.width / 2);
        targetY = Math.round(anchor.y - bounds.height / 2);
      } else if (studioWindow && !studioWindow.isDestroyed()) {
        // Fallback: top-right toolbar area of studio window
        const studioBounds = studioWindow.getBounds();
        targetX = Math.round(studioBounds.x + studioBounds.width - bounds.width - 24);
        targetY = Math.round(studioBounds.y + 12);
      }

      if (targetX !== undefined && targetY !== undefined) {
        const targetDisplay = screen.getDisplayNearestPoint({ x: targetX, y: targetY }) || primaryDisplay;
        const workArea = targetDisplay.workArea;

        const clampedX = Math.max(
          workArea.x + 8,
          Math.min(targetX, workArea.x + workArea.width - bounds.width - 8)
        );
        const clampedY = Math.max(
          workArea.y + 8,
          Math.min(targetY, workArea.y + workArea.height - bounds.height - 8)
        );

        overlayWindow.setPosition(clampedX, clampedY);
      }

      overlayWindow.showInactive();
      if (lastActiveProject) {
        overlayWindow.webContents.send('active-project-synced', lastActiveProject);
      }
    }

    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.hide();
    }
  });

  ipcMain.on('restore-studio', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }

    if (!studioWindow || studioWindow.isDestroyed()) {
      createStudioWindow();
    }

    if (studioWindow && !studioWindow.isDestroyed()) {
      if (studioWindow.isMinimized()) {
        studioWindow.restore();
      }
      studioWindow.show();
      studioWindow.focus();
      studioWindow.webContents.send('studio-restored');
    }
  });

  ipcMain.on('sync-active-project', (event, project: SopProject | null) => {
    lastActiveProject = project;
    if (overlayWindow && !overlayWindow.isDestroyed() && event.sender !== overlayWindow.webContents) {
      overlayWindow.webContents.send('active-project-synced', project);
    }
    if (studioWindow && !studioWindow.isDestroyed() && event.sender !== studioWindow.webContents) {
      studioWindow.webContents.send('active-project-synced', project);
    }
  });

  ipcMain.on('set-retake-step-id', (_event, stepId: string | null) => {
    currentRetakeStepId = stepId;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('retake-step-id-changed', stepId);
    }
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send('retake-step-id-changed', stepId);
    }
  });

  ipcMain.handle('get-retake-step-id', (): string | null => {
    return currentRetakeStepId;
  });

  ipcMain.handle('get-active-project', (): SopProject | null => {
    return lastActiveProject;
  });

  ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  });

  ipcMain.on(
    'set-overlay-size',
    (_event, mode: 'collapsed' | 'expanded' | 'preview' | 'error_match' | 'error_new' | 'search') => {
      setOverlayMode(mode);
    }
  );

  // Error & FAQ Knowledge Base + OCR
  ipcMain.handle('analyze-error-image', async (_event, imagePathOrBase64: string): Promise<OcrAnalysisResult> => {
    if (!RELEASE_FEATURES.errorFaq) {
      return {
        rawText: '',
        detectedTitle: '',
        detectedErrorCode: undefined,
        imagePath: imagePathOrBase64,
      };
    }
    return await analyzeImageWithOcr(imagePathOrBase64);
  });

  ipcMain.handle('list-error-faq', async (): Promise<ErrorFaqItem[]> => {
    if (!RELEASE_FEATURES.errorFaq) return [];
    return await listErrorFaqItems();
  });

  ipcMain.handle('save-error-faq', async (_event, item: ErrorFaqItem): Promise<boolean> => {
    if (!RELEASE_FEATURES.errorFaq) return false;
    return await saveErrorFaqItem(item);
  });

  ipcMain.handle('delete-error-faq', async (_event, id: string): Promise<boolean> => {
    if (!RELEASE_FEATURES.errorFaq) return false;
    return await deleteErrorFaqItem(id);
  });

  ipcMain.handle('import-pasted-image', async (_event, base64Data: string): Promise<string> => {
    return await importPastedImageHelper(base64Data);
  });

  // Project I/O
  ipcMain.handle('list-projects', async (): Promise<SopProject[]> => {
    try {
      await ensureDirectories();
      const projectsDir = getProjectsDir();
      const files = await fs.promises.readdir(projectsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const projectMap = new Map<string, { project: SopProject; file: string; mtime: number }>();

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(projectsDir, file);
          const stat = await fs.promises.stat(filePath);
          const raw = await fs.promises.readFile(filePath, 'utf-8');
          const project = JSON.parse(raw) as SopProject;
          if (project && project.id) {
            const existing = projectMap.get(project.id);
            const projectTime = new Date(project.updatedAt || project.createdAt || 0).getTime() || stat.mtimeMs;
            if (!existing) {
              projectMap.set(project.id, { project, file, mtime: projectTime });
            } else {
              if (projectTime >= existing.mtime) {
                if (!existing.file.startsWith('proj_') && file.startsWith('proj_')) {
                  fs.promises.unlink(path.join(projectsDir, existing.file)).catch(() => {});
                }
                projectMap.set(project.id, { project, file, mtime: projectTime });
              } else {
                if (!file.startsWith('proj_') && existing.file.startsWith('proj_')) {
                  fs.promises.unlink(filePath).catch(() => {});
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[ProjectIO] Could not parse project file ${file}:`, err);
        }
      }

      const projects = Array.from(projectMap.values()).map((v) => v.project);

      projects.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      return projects;
    } catch (err) {
      console.error('[ProjectIO] Failed to list projects:', err);
      return [];
    }
  });

  ipcMain.handle('save-project', async (_event, project: SopProject): Promise<boolean> => {
    if (!project || typeof project !== 'object' || !project.id || typeof project.id !== 'string') {
      console.error('[ProjectIO] Invalid project object provided to save-project');
      return false;
    }

    return queueProjectSave(project.id, async () => {
      try {
        await ensureDirectories();
        const safeId = project.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = path.join(getProjectsDir(), `proj_${safeId}.json`);
        const tempPath = path.join(
          getProjectsDir(),
          `proj_${safeId}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`
        );

        const now = new Date().toISOString();
        if (!project.createdAt) {
          project.createdAt = now;
        }
        project.updatedAt = now;

        // Defense-in-depth: convert any inline base64 images to local assets so project JSON stays lightweight
        if (project.coverPage?.backgroundImage?.startsWith('data:image/')) {
          try {
            project.coverPage.backgroundImage = await importPastedImageHelper(project.coverPage.backgroundImage);
          } catch (e) {
            console.warn('[ProjectIO] Failed to convert cover base64:', e);
          }
        }
        if (Array.isArray(project.steps)) {
          for (const step of project.steps) {
            if (step.image?.originalImagePath?.startsWith('data:image/')) {
              try {
                step.image.originalImagePath = await importPastedImageHelper(step.image.originalImagePath);
              } catch (e) {
                console.warn('[ProjectIO] Failed to convert step base64:', e);
              }
            }
          }
        }

        lastActiveProject = project;

        const existingTimer = saveSuppressionTimers.get(filePath);
        if (existingTimer) clearTimeout(existingTimer);
        recentlySavedByApp.add(filePath);
        saveSuppressionTimers.set(
          filePath,
          setTimeout(() => {
            recentlySavedByApp.delete(filePath);
            saveSuppressionTimers.delete(filePath);
          }, 1000)
        );

        // Atomic write via unique temp file and rename
        await fs.promises.writeFile(tempPath, JSON.stringify(project, null, 2), 'utf-8');
        await fs.promises.rename(tempPath, filePath);
        return true;
      } catch (err) {
        console.error('[ProjectIO] Failed to save project:', err);
        return false;
      }
    });
  });

  ipcMain.handle('load-project', async (_event, id: string): Promise<SopProject | null> => {
    try {
      if (!id || typeof id !== 'string') return null;
      await ensureDirectories();
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(getProjectsDir(), `proj_${safeId}.json`);

      try {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as SopProject;
      } catch (readErr: any) {
        if (readErr && readErr.code === 'ENOENT') {
          // Backward compatibility check for legacy un-prefixed filenames
          const legacyPath = path.join(getProjectsDir(), `${safeId}.json`);
          try {
            const legacyRaw = await fs.promises.readFile(legacyPath, 'utf-8');
            return JSON.parse(legacyRaw) as SopProject;
          } catch {
            return null;
          }
        }
        throw readErr;
      }
    } catch (err) {
      console.error(`[ProjectIO] Failed to load project ${id}:`, err);
      return null;
    }
  });

  ipcMain.handle('delete-project', async (_event, id: string): Promise<boolean> => {
    try {
      if (!id || typeof id !== 'string') return false;
      await ensureDirectories();
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(getProjectsDir(), `proj_${safeId}.json`);
      const legacyPath = path.join(getProjectsDir(), `${safeId}.json`);

      if (lastActiveProject?.id === id) {
        lastActiveProject = null;
      }

      recentlySavedByApp.add(filePath);
      recentlySavedByApp.add(legacyPath);
      setTimeout(() => {
        recentlySavedByApp.delete(filePath);
        recentlySavedByApp.delete(legacyPath);
      }, 800);

      let deleted = false;
      try {
        await fs.promises.unlink(filePath);
        deleted = true;
      } catch (err: any) {
        if (err.code !== 'ENOENT') console.warn(`[ProjectIO] Unlink error for ${filePath}:`, err);
      }

      try {
        await fs.promises.unlink(legacyPath);
        deleted = true;
      } catch (err: any) {
        if (err.code !== 'ENOENT') console.warn(`[ProjectIO] Unlink error for ${legacyPath}:`, err);
      }

      setTimeout(() => {
        cleanupOrphanedAssets().catch(() => {});
      }, 1500);

      return deleted || true;
    } catch (err) {
      console.error(`[ProjectIO] Failed to delete project ${id}:`, err);
      return false;
    }
  });

  // Export HTML
  ipcMain.handle(
    'export-html',
    async (
      _event,
      project: SopProject,
      htmlContent?: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (!project || !project.name) {
          return { success: false, error: 'Invalid project data provided' };
        }

        const safeDefaultName = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sop'}.html`;
        const { canceled, filePath } = await showSaveDialogHelper({
          title: 'Export SOP as HTML',
          defaultPath: safeDefaultName,
          filters: [{ name: 'HTML Document', extensions: ['html'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export canceled by user' };
        }

        if (htmlContent) {
          await fs.promises.writeFile(filePath, htmlContent, 'utf-8');
          return { success: true, filePath };
        }

        return { success: false, error: 'No HTML content provided' };
      } catch (err) {
        console.error('[ExportHTML] Error exporting HTML:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // Export PDF
  ipcMain.handle(
    'export-pdf',
    async (
      _event,
      project: SopProject,
      pdfData?: ArrayBuffer | Uint8Array | string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (!project || !project.name) {
          return { success: false, error: 'Invalid project data provided' };
        }

        const safeDefaultName = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sop'}.pdf`;
        const { canceled, filePath } = await showSaveDialogHelper({
          title: 'Export SOP as PDF',
          defaultPath: safeDefaultName,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export canceled by user' };
        }

        if (pdfData) {
          let buffer: Buffer;
          if (typeof pdfData === 'string') {
            const cleanBase64 = pdfData.replace(/^data:[^;]+;base64,/, '');
            buffer = Buffer.from(cleanBase64, pdfData.startsWith('data:') ? 'base64' : 'utf-8');
          } else {
            buffer = Buffer.from(pdfData);
          }
          await fs.promises.writeFile(filePath, buffer);
          return { success: true, filePath };
        }

        return { success: false, error: 'No PDF data provided' };
      } catch (err) {
        console.error('[ExportPDF] Error exporting PDF:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // Export PPTX
  ipcMain.handle(
    'export-pptx',
    async (
      _event,
      project: SopProject,
      pptxData?: ArrayBuffer | Uint8Array | string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (!project || !project.name) {
          return { success: false, error: 'Invalid project data provided' };
        }

        const safeDefaultName = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sop'}.pptx`;
        const { canceled, filePath } = await showSaveDialogHelper({
          title: 'Export SOP as PowerPoint',
          defaultPath: safeDefaultName,
          filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }],
        });

        if (canceled || !filePath) {
          return { success: false, error: 'Export canceled by user' };
        }

        if (pptxData) {
          let buffer: Buffer;
          if (typeof pptxData === 'string') {
            const cleanBase64 = pptxData.replace(/^data:[^;]+;base64,/, '');
            buffer = Buffer.from(cleanBase64, pptxData.startsWith('data:') ? 'base64' : 'binary');
          } else {
            buffer = Buffer.from(pptxData);
          }
          await fs.promises.writeFile(filePath, buffer);
          return { success: true, filePath };
        }

        return { success: false, error: 'No PowerPoint data provided' };
      } catch (err) {
        console.error('[ExportPPTX] Error exporting PPTX:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  // Workspace & Shared Storage Management
  ipcMain.handle('get-workspace-path', async () => {
    return {
      path: getWorkspaceRoot(),
      isCustom: Boolean(customStorageDir),
      defaultPath: app.getPath('userData'),
      mcpServerPath: getMcpServerPath(),
    };
  });

  ipcMain.handle('open-workspace-folder', async () => {
    try {
      const root = getWorkspaceRoot();
      await ensureDirectories();
      await shell.openPath(root);
    } catch (err) {
      console.warn('[Workspace] Failed to open folder:', err);
    }
  });

  ipcMain.handle('change-workspace-path', async () => {
    try {
      const { canceled, filePaths } = await showOpenDialogHelper({
        title: 'Select StepFlow Team Workspace Folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Workspace Folder',
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true, error: 'Selection canceled' };
      }

      const selectedDir = filePaths[0];
      const previousProjectsDir = getProjectsDir();
      const previousAssetsDir = getAssetsDir();

      customStorageDir = selectedDir;
      saveConfig();

      // Ensure new workspace subdirectories exist
      await ensureDirectories();

      // Migrate existing local projects to new workspace if new workspace is empty
      try {
        const newProjectsDir = getProjectsDir();
        const existingInNew = await fs.promises.readdir(newProjectsDir).catch(() => []);
        const jsonInNew = existingInNew.filter((f) => f.endsWith('.json'));

        if (jsonInNew.length === 0 && fs.existsSync(previousProjectsDir)) {
          const oldFiles = await fs.promises.readdir(previousProjectsDir).catch(() => []);
          for (const f of oldFiles) {
            if (f.endsWith('.json')) {
              await fs.promises.copyFile(
                path.join(previousProjectsDir, f),
                path.join(newProjectsDir, f)
              ).catch(() => {});
            }
          }

          if (fs.existsSync(previousAssetsDir)) {
            const oldAssets = await fs.promises.readdir(previousAssetsDir).catch(() => []);
            for (const a of oldAssets) {
              if (a.endsWith('.png') || a.endsWith('.jpg') || a.endsWith('.svg')) {
                await fs.promises.copyFile(
                  path.join(previousAssetsDir, a),
                  path.join(getAssetsDir(), a)
                ).catch(() => {});
              }
            }
          }
        }
      } catch (copyErr) {
        console.warn('[Workspace] Note on copying existing projects:', copyErr);
      }

      // Re-initialize projects file watcher on the new directory
      setupProjectsFileWatcher();

      const pathInfo = {
        path: getWorkspaceRoot(),
        isCustom: true,
        defaultPath: app.getPath('userData'),
        mcpServerPath: getMcpServerPath(),
      };

      if (studioWindow && !studioWindow.isDestroyed()) {
        studioWindow.webContents.send('workspace-path-changed', pathInfo);
      }
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('workspace-path-changed', pathInfo);
      }

      return { success: true, newPath: selectedDir };
    } catch (err) {
      console.error('[Workspace] Failed to change workspace folder:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('reset-workspace-path', async () => {
    try {
      customStorageDir = null;
      saveConfig();
      await ensureDirectories();
      setupProjectsFileWatcher();

      const pathInfo = {
        path: getWorkspaceRoot(),
        isCustom: false,
        defaultPath: app.getPath('userData'),
        mcpServerPath: getMcpServerPath(),
      };

      if (studioWindow && !studioWindow.isDestroyed()) {
        studioWindow.webContents.send('workspace-path-changed', pathInfo);
      }
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('workspace-path-changed', pathInfo);
      }

      return { success: true, defaultPath: app.getPath('userData') };
    } catch (err) {
      console.error('[Workspace] Failed to reset workspace folder:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Export Markdown Native Save
  ipcMain.handle(
    'export-markdown',
    async (
      _event,
      payload: { markdown: string; defaultName?: string }
    ): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }> => {
      try {
        if (!payload || !payload.markdown) {
          return { success: false, error: 'No markdown content provided' };
        }
        const defaultName = payload.defaultName || 'procedure.md';
        const { canceled, filePath } = await showSaveDialogHelper({
          title: 'Export Markdown Document',
          defaultPath: defaultName,
          filters: [{ name: 'Markdown Document (*.md)', extensions: ['md'] }],
        });

        if (canceled || !filePath) {
          return { success: false, canceled: true, error: 'Export canceled by user' };
        }

        await fs.promises.writeFile(filePath, payload.markdown, 'utf-8');
        return { success: true, filePath };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to export markdown' };
      }
    }
  );

  // Portable Bundles (.stepflow export & import)
  ipcMain.handle(
    'export-project-bundle',
    async (
      _event,
      project: SopProject
    ): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }> => {
      try {
        if (!project || !project.name) {
          return { success: false, error: 'Invalid project data provided' };
        }

        const safeDefaultName = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'procedure'}.stepflow`;
        const { canceled, filePath } = await showSaveDialogHelper({
          title: 'Export StepFlow Portable Bundle',
          defaultPath: safeDefaultName,
          filters: [
            { name: 'StepFlow Bundle (*.stepflow)', extensions: ['stepflow'] },
            { name: 'Zip Archive (*.zip)', extensions: ['zip'] },
          ],
        });

        if (canceled || !filePath) {
          return { success: false, canceled: true, error: 'Export canceled by user' };
        }

        const zip = new JSZip();

        // 1. Add manifest
        const manifest = {
          format: 'stepflow',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          projectId: project.id,
          name: project.name,
          author: project.author,
          stepCount: project.steps.length,
        };
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // 2. Clone project for bundle
        const bundledProject: SopProject = JSON.parse(JSON.stringify(project));
        const assetsFolder = zip.folder('assets');

        // 3. Collect and embed assets
        if (bundledProject.coverPage?.backgroundImage) {
          const rawCover = bundledProject.coverPage.backgroundImage;
          const coverFileName = `cover_${bundledProject.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

          if (rawCover.startsWith('data:image/')) {
            const commaIdx = rawCover.indexOf(',');
            const base64Data = commaIdx !== -1 ? rawCover.slice(commaIdx + 1) : rawCover;
            if (assetsFolder) {
              assetsFolder.file(coverFileName, Buffer.from(base64Data, 'base64'));
              bundledProject.coverPage.backgroundImage = `assets/${coverFileName}`;
            }
          } else {
            const resolved = resolveStepflowAssetPath(rawCover);
            if (isSafeAssetFile(resolved)) {
              const imgBuffer = await fs.promises.readFile(resolved);
              if (assetsFolder) {
                assetsFolder.file(coverFileName, imgBuffer);
                bundledProject.coverPage.backgroundImage = `assets/${coverFileName}`;
              }
            } else {
              console.warn('[ExportBundle] Skipped unsafe cover asset path:', rawCover);
            }
          }
        }

        for (const step of bundledProject.steps) {
          if (step.image && step.image.originalImagePath) {
            const rawPath = step.image.originalImagePath;
            const assetFileName = `step_${step.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

            if (rawPath.startsWith('data:image/')) {
              const commaIdx = rawPath.indexOf(',');
              const base64Data = commaIdx !== -1 ? rawPath.slice(commaIdx + 1) : rawPath;
              if (assetsFolder) {
                assetsFolder.file(assetFileName, Buffer.from(base64Data, 'base64'));
                step.image.originalImagePath = `assets/${assetFileName}`;
              }
            } else {
              const resolved = resolveStepflowAssetPath(rawPath);

              if (isSafeAssetFile(resolved)) {
                const imgBuffer = await fs.promises.readFile(resolved);
                if (assetsFolder) {
                  assetsFolder.file(assetFileName, imgBuffer);
                  step.image.originalImagePath = `assets/${assetFileName}`;
                }
              } else {
                console.warn('[ExportBundle] Skipped unsafe asset path:', rawPath);
              }
            }
          }
        }

        zip.file('project.json', JSON.stringify(bundledProject, null, 2));

        const zipBuffer = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });

        await fs.promises.writeFile(filePath, zipBuffer);
        return { success: true, filePath };
      } catch (err) {
        console.error('[ExportBundle] Failed to export bundle:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'import-project-bundle',
    async (): Promise<{ success: boolean; canceled?: boolean; project?: SopProject; error?: string }> => {
      try {
        const { canceled, filePaths } = await showOpenDialogHelper({
          title: 'Import StepFlow Bundle',
          filters: [
            { name: 'StepFlow Bundle (*.stepflow, *.zip)', extensions: ['stepflow', 'zip'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });

        if (canceled || !filePaths || filePaths.length === 0) {
          return { success: false, canceled: true, error: 'Import canceled by user' };
        }

        const bundlePath = filePaths[0];
        const fileBuffer = await fs.promises.readFile(bundlePath);
        const zip = await JSZip.loadAsync(fileBuffer);

        // Find project.json; exclude manifest.json from fallback matching
        let projectJsonFile = zip.file('project.json');
        if (!projectJsonFile) {
          const jsonCandidates = zip.file(/^[^/]+\.json$/);
          projectJsonFile = jsonCandidates.find((f) => f.name !== 'manifest.json') || null;
        }
        if (!projectJsonFile) {
          return { success: false, error: 'Invalid StepFlow bundle: missing project.json' };
        }

        const projectRaw = await projectJsonFile.async('text');
        const project = JSON.parse(projectRaw) as SopProject;

        if (!project || !project.id || !project.name) {
          return { success: false, error: 'Invalid project data in bundle' };
        }

        // Defensive normalization
        project.steps = Array.isArray(project.steps) ? project.steps : [];
        for (let i = 0; i < project.steps.length; i++) {
          const s = project.steps[i];
          if (!s.id) s.id = `step_${Date.now()}_${i}`;
          s.order = typeof s.order === 'number' ? s.order : i + 1;
          s.title = typeof s.title === 'string' ? s.title : `Step ${s.order}`;
          s.description = typeof s.description === 'string' ? s.description : '';
          if (s.image) {
            s.image.annotations = Array.isArray(s.image.annotations) ? s.image.annotations : [];
          }
        }

        await ensureDirectories();
        const assetsDir = getAssetsDir();

        // Extract assets safely (with Zip-Slip and path traversal protection)
        if (project.coverPage?.backgroundImage) {
          const rawCover = project.coverPage.backgroundImage;
          const zipCoverPath = rawCover.startsWith('assets/') ? rawCover : `assets/${rawCover}`;
          const zipCoverFile = zip.file(zipCoverPath) || zip.file(rawCover);

          if (zipCoverFile) {
            const assetBuffer = await zipCoverFile.async('nodebuffer');
            let ext = path.extname(zipCoverPath).toLowerCase();
            if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
              ext = '.png';
            }
            const targetName = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
            const targetPath = path.resolve(assetsDir, path.basename(targetName));
            if (targetPath.startsWith(assetsDir)) {
              await fs.promises.writeFile(targetPath, assetBuffer);
              project.coverPage.backgroundImage = toStepflowAssetUrl(targetPath);
            }
          }
        }

        if (Array.isArray(project.steps)) {
          for (const step of project.steps) {
            if (step.image && step.image.originalImagePath) {
              const rawPath = step.image.originalImagePath;
              const zipAssetPath = rawPath.startsWith('assets/') ? rawPath : `assets/${rawPath}`;
              const zipAssetFile = zip.file(zipAssetPath) || zip.file(rawPath);

              if (zipAssetFile) {
                const assetBuffer = await zipAssetFile.async('nodebuffer');
                let ext = path.extname(zipAssetPath).toLowerCase();
                if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
                  ext = '.png';
                }
                const targetName = `step_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
                const targetPath = path.resolve(assetsDir, path.basename(targetName));
                if (targetPath.startsWith(assetsDir)) {
                  await fs.promises.writeFile(targetPath, assetBuffer);
                  step.image.originalImagePath = toStepflowAssetUrl(targetPath);
                }
              }
            }
          }
        }

        // Check for ID collision; if duplicate, assign fresh ID and suffix title
        const initialSafeId = path.basename(project.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const existingPath = path.join(getProjectsDir(), `proj_${initialSafeId}.json`);
        if (fs.existsSync(existingPath)) {
          project.id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          project.name = `${project.name} (Imported)`;
        }

        project.updatedAt = new Date().toISOString();

        // Save project into active projects directory atomically via queueProjectSave
        const finalSafeId = path.basename(project.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const savePath = path.join(getProjectsDir(), `proj_${finalSafeId}.json`);
        recentlySavedByApp.add(savePath);
        setTimeout(() => recentlySavedByApp.delete(savePath), 800);

        await queueProjectSave(project.id, async () => {
          const tempPath = path.join(
            getProjectsDir(),
            `proj_${finalSafeId}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`
          );
          await fs.promises.writeFile(tempPath, JSON.stringify(project, null, 2), 'utf-8');
          await fs.promises.rename(tempPath, savePath);
          return true;
        });

        // Broadcast to studio window
        if (studioWindow && !studioWindow.isDestroyed()) {
          studioWindow.webContents.send('project-file-changed', {
            id: project.id,
            action: 'save',
            project,
          });
        }

        return { success: true, project };
      } catch (err) {
        console.error('[ImportBundle] Failed to import bundle:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}

// App lifecycle
app.whenReady().then(async () => {
  appendRuntimeLog('[App] whenReady start');

  process.on('uncaughtException', (err) => {
    appendRuntimeLog('[Process] uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    appendRuntimeLog('[Process] unhandledRejection', reason);
  });

  app.on('child-process-gone', (_event, details) => {
    appendRuntimeLog(
      `[App] child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  app.on('browser-window-created', (_event, window) => {
    appendRuntimeLog('[App] browser-window-created');
    window.on('closed', () => {
      appendRuntimeLog('[App] browser-window-closed');
    });
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    appendRuntimeLog(
      `[App] render-process-gone reason=${details.reason} exitCode=${details.exitCode} url=${webContents.getURL()}`
    );
  });

  loadConfig();
  // Protocol handler for streaming local assets securely
  protocol.handle('stepflow-asset', (request) => {
    try {
      const resolved = resolveStepflowAssetPath(request.url);

      if (!isSafeAssetFile(resolved)) {
        console.warn('[Protocol] Access denied or unsafe asset:', resolved);
        return new Response('Access denied', { status: 403 });
      }

      return net.fetch(pathToFileURL(resolved).toString());
    } catch (err) {
      console.error('[Protocol] Error streaming asset:', err);
      return new Response('Asset not found', { status: 404 });
    }
  });

  await ensureDirectories();
  appendRuntimeLog('[App] directories ready');
  setupProjectsFileWatcher();
  registerIpcHandlers();
  registerGlobalShortcuts();
  appendRuntimeLog('[App] ipc and shortcuts registered');

  createStudioWindow();
  appendRuntimeLog('[App] windows created');

  // Schedule background cleanup of unreferenced orphan screenshot files after window init
  setTimeout(() => {
    cleanupOrphanedAssets().catch((err: unknown) => console.warn('[App] Startup asset cleanup notice:', err));
  }, 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 || !studioWindow || studioWindow.isDestroyed()) {
      createStudioWindow();
    } else {
      studioWindow.show();
      studioWindow.focus();
    }
  });
});

app.on('second-instance', () => {
  if (!studioWindow || studioWindow.isDestroyed()) {
    createStudioWindow();
    return;
  }

  if (studioWindow.isMinimized()) {
    studioWindow.restore();
  }
  studioWindow.show();
  studioWindow.focus();
});

app.on('window-all-closed', () => {
  appendRuntimeLog('[App] window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  appendRuntimeLog('[App] will-quit');
  if (projectWatcher) {
    try {
      projectWatcher.close();
    } catch {}
  }
  globalShortcut.unregisterAll();
});
