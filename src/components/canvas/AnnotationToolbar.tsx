import React, { useState, useRef, useEffect } from 'react';
import {
  MousePointer,
  MoveRight,
  Square,
  EyeOff,
  ZoomIn,
  Type,
  Crop,
  Undo2,
  Redo2,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Bold,
  Italic,
  ChevronDown
} from 'lucide-react';
import {
  TextSettings,
  DEFAULT_TEXT_SETTINGS,
  LoupeSettings,
  DEFAULT_LOUPE_SETTINGS
} from '../../types/sop';
import { isMacPlatform } from '../../utils/platform';

export type ToolType =
  | 'select'
  | 'badge'
  | 'arrow'
  | 'rectangle'
  | 'blur'
  | 'zoom_loupe'
  | 'text'
  | 'crop';

export interface ColorPreset {
  name: string;
  value: string;
  twClass: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Blue', value: '#2563eb', twClass: 'bg-blue-600' },
  { name: 'Red', value: '#ef4444', twClass: 'bg-red-500' },
  { name: 'Green', value: '#10b981', twClass: 'bg-emerald-500' },
  { name: 'Amber', value: '#f59e0b', twClass: 'bg-amber-500' },
  { name: 'Zinc', value: '#18181b', twClass: 'bg-zinc-900 dark:bg-zinc-200' }
];

export const STROKE_WIDTH_PRESETS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 6 }
];

export interface AnnotationToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  currentStrokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  textSettings?: TextSettings;
  onTextSettingsChange?: (settings: TextSettings) => void;
  loupeSettings?: LoupeSettings;
  onLoupeSettingsChange?: (settings: LoupeSettings) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  nextBadgeNumber?: number;
  className?: string;
}

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeTool,
  onSelectTool,
  currentColor,
  onColorChange,
  currentStrokeWidth,
  onStrokeWidthChange,
  textSettings,
  onTextSettingsChange,
  loupeSettings,
  onLoupeSettingsChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelection,
  onDeleteSelected,
  onClearAll,
  nextBadgeNumber = 1,
  className = ''
}) => {
  const [showStylePopup, setShowStylePopup] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [showLoupeSettings, setShowLoupeSettings] = useState(false);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const isLongPressTriggeredRef = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isLoupeLongPressTriggeredRef = useRef(false);
  const loupeLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveTextSettings = textSettings || DEFAULT_TEXT_SETTINGS;
  const effectiveLoupeSettings = loupeSettings || DEFAULT_LOUPE_SETTINGS;
  const isMac = isMacPlatform();
  const undoShortcut = isMac ? 'Cmd+Z' : 'Ctrl+Z';
  const redoShortcut = isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y';

  // Click outside to close any open popups
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowTextSettings(false);
        setShowLoupeSettings(false);
        setShowStylePopup(false);
        setShowClearConfirm(false);
      }
    };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTextSettings(false);
        setShowLoupeSettings(false);
        setShowStylePopup(false);
        setShowClearConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleGlobalMouseDown);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('keydown', handleGlobalKeyDown);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (loupeLongPressTimerRef.current) clearTimeout(loupeLongPressTimerRef.current);
    };
  }, []);

  const updateTextSetting = <K extends keyof TextSettings>(key: K, value: TextSettings[K]) => {
    if (onTextSettingsChange) {
      onTextSettingsChange({
        ...effectiveTextSettings,
        [key]: value
      });
    }
  };

  const updateLoupeSetting = <K extends keyof LoupeSettings>(key: K, value: LoupeSettings[K]) => {
    if (onLoupeSettingsChange) {
      onLoupeSettingsChange({
        ...effectiveLoupeSettings,
        [key]: value
      });
    }
  };

  const handleTextMouseDown = () => {
    isLongPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      onSelectTool('text');
      setShowTextSettings(true);
    }, 280);
  };

  const handleTextMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLoupeMouseDown = () => {
    isLoupeLongPressTriggeredRef.current = false;
    if (loupeLongPressTimerRef.current) clearTimeout(loupeLongPressTimerRef.current);
    loupeLongPressTimerRef.current = setTimeout(() => {
      isLoupeLongPressTriggeredRef.current = true;
      onSelectTool('zoom_loupe');
      setShowLoupeSettings(true);
    }, 280);
  };

  const handleLoupeMouseUp = () => {
    if (loupeLongPressTimerRef.current) {
      clearTimeout(loupeLongPressTimerRef.current);
      loupeLongPressTimerRef.current = null;
    }
  };

  const tools: Array<{
    id: ToolType;
    label: string;
    shortcut: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'select',
      label: 'Select / Move',
      shortcut: 'V',
      icon: <MousePointer className="w-4 h-4" />
    },
    {
      id: 'badge',
      label: `Badge (Next: #${nextBadgeNumber})`,
      shortcut: 'B',
      icon: (
        <span className="w-4 h-4 rounded-full border border-current font-bold text-[10px] flex items-center justify-center font-mono">
          {nextBadgeNumber > 9 ? '•' : nextBadgeNumber}
        </span>
      )
    },
    {
      id: 'arrow',
      label: 'Arrow Pointer',
      shortcut: 'A',
      icon: <MoveRight className="w-4 h-4" />
    },
    {
      id: 'rectangle',
      label: 'Highlight Box',
      shortcut: 'R',
      icon: <Square className="w-4 h-4" />
    },
    {
      id: 'blur',
      label: 'Redaction / PII Mask',
      shortcut: 'X',
      icon: <EyeOff className="w-4 h-4" />
    },
    {
      id: 'zoom_loupe',
      label: 'Detail Loupe (2x/3x)',
      shortcut: 'Z',
      icon: <ZoomIn className="w-4 h-4" />
    },
    {
      id: 'text',
      label: 'Text Callout',
      shortcut: 'T',
      icon: <Type className="w-4 h-4" />
    },
    {
      id: 'crop',
      label: 'Crop Screenshot',
      shortcut: 'C',
      icon: <Crop className="w-4 h-4" />
    }
  ];

  return (
    <div
      ref={toolbarRef}
      className={`relative inline-flex items-center gap-1 p-1 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-xl shadow-zinc-950/10 transition-all select-none ${className}`}
    >
      {/* Primary Tool Buttons */}
      <div className="flex items-center gap-0.5">
        {tools.map((t) => {
          const isActive = activeTool === t.id;

          if (t.id === 'zoom_loupe') {
            return (
              <div key={t.id} className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (isLoupeLongPressTriggeredRef.current) {
                      isLoupeLongPressTriggeredRef.current = false;
                      return;
                    }
                    if (activeTool === 'zoom_loupe') {
                      setShowLoupeSettings((prev) => !prev);
                    } else {
                      onSelectTool('zoom_loupe');
                    }
                  }}
                  onMouseDown={handleLoupeMouseDown}
                  onMouseUp={handleLoupeMouseUp}
                  onMouseLeave={handleLoupeMouseUp}
                  onTouchStart={handleLoupeMouseDown}
                  onTouchEnd={handleLoupeMouseUp}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelectTool('zoom_loupe');
                    setShowLoupeSettings(true);
                  }}
                  title={`${t.label} (${t.shortcut}) • Click or hold for size & zoom settings`}
                  className={`relative flex items-center justify-center ${
                    isActive ? 'px-2' : 'w-8'
                  } h-8 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                  }`}
                >
                  <span className="flex items-center gap-0.5">
                    {t.icon}
                    {isActive && (
                      <ChevronDown
                        className={`w-3 h-3 text-zinc-400 dark:text-zinc-500 transition-transform ${
                          showLoupeSettings ? 'rotate-180 text-blue-400' : ''
                        }`}
                      />
                    )}
                  </span>
                  {isActive && (
                    <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-500" />
                  )}
                </button>

                {/* Loupe Size & Magnification Settings Popover */}
                {showLoupeSettings && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl p-3 z-50 min-w-[260px] flex flex-col gap-3 animate-in fade-in zoom-in-95 text-zinc-800 dark:text-zinc-200 select-none">
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <ZoomIn className="w-3.5 h-3.5 text-blue-500" />
                        Magnifier / Loupe Settings
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowLoupeSettings(false)}
                        className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Lens Size / Radius */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <span>Lens Diameter (Size)</span>
                        <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {effectiveLoupeSettings.radius * 2}px ø
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateLoupeSetting(
                              'radius',
                              Math.max(45, effectiveLoupeSettings.radius - 10)
                            )
                          }
                          className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                          title="Decrease lens size"
                        >
                          -
                        </button>

                        <div className="flex-1 grid grid-cols-4 gap-1">
                          {[
                            { label: 'S', radius: 60 },
                            { label: 'M', radius: 90 },
                            { label: 'L', radius: 130 },
                            { label: 'XL', radius: 170 }
                          ].map((preset) => (
                            <button
                              key={preset.radius}
                              type="button"
                              onClick={() => updateLoupeSetting('radius', preset.radius)}
                              className={`py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                                effectiveLoupeSettings.radius === preset.radius
                                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateLoupeSetting(
                              'radius',
                              Math.min(220, effectiveLoupeSettings.radius + 10)
                            )
                          }
                          className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                          title="Increase lens size"
                        >
                          +
                        </button>
                      </div>

                      <input
                        type="range"
                        min="45"
                        max="220"
                        step="5"
                        value={effectiveLoupeSettings.radius}
                        onChange={(e) => updateLoupeSetting('radius', parseInt(e.target.value, 10))}
                        className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-1"
                      />
                    </div>

                    {/* Magnification Level */}
                    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <span>Magnification Factor</span>
                        <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {effectiveLoupeSettings.zoomFactor}x
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1">
                        {[1.5, 2, 2.5, 3, 4].map((zf) => (
                          <button
                            key={zf}
                            type="button"
                            onClick={() => updateLoupeSetting('zoomFactor', zf)}
                            className={`py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                              effectiveLoupeSettings.zoomFactor === zf
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {zf}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-center">
                      Tip: Drag rim handle on canvas to resize directly
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (t.id === 'text') {
            return (
              <div key={t.id} className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (isLongPressTriggeredRef.current) {
                      isLongPressTriggeredRef.current = false;
                      return;
                    }
                    if (activeTool === 'text') {
                      setShowTextSettings((prev) => !prev);
                    } else {
                      onSelectTool('text');
                    }
                  }}
                  onMouseDown={handleTextMouseDown}
                  onMouseUp={handleTextMouseUp}
                  onMouseLeave={handleTextMouseUp}
                  onTouchStart={handleTextMouseDown}
                  onTouchEnd={handleTextMouseUp}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelectTool('text');
                    setShowTextSettings(true);
                  }}
                  title={`${t.label} (${t.shortcut}) • Click or hold for font & style`}
                  className={`relative flex items-center justify-center ${
                    isActive ? 'px-2' : 'w-8'
                  } h-8 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                  }`}
                >
                  <span className="flex items-center gap-0.5">
                    {t.icon}
                    {isActive && (
                      <ChevronDown
                        className={`w-3 h-3 text-zinc-400 dark:text-zinc-500 transition-transform ${
                          showTextSettings ? 'rotate-180 text-blue-400' : ''
                        }`}
                      />
                    )}
                  </span>
                  {isActive && (
                    <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-500" />
                  )}
                </button>

                {/* Text Formatting & Font Size Popover */}
                {showTextSettings && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl p-3 z-50 min-w-[250px] flex flex-col gap-3 animate-in fade-in zoom-in-95 text-zinc-800 dark:text-zinc-200 select-none">
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-blue-500" />
                        Text Callout Settings
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTextSettings(false)}
                        className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Font Size Stepper & Presets */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <span>Font Size</span>
                        <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {effectiveTextSettings.fontSize}px
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateTextSetting(
                              'fontSize',
                              Math.max(12, effectiveTextSettings.fontSize - 2)
                            )
                          }
                          className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                          title="Decrease font size"
                        >
                          -
                        </button>

                        <div className="flex-1 grid grid-cols-4 gap-1">
                          {[
                            { label: 'S', size: 16 },
                            { label: 'M', size: 22 },
                            { label: 'L', size: 30 },
                            { label: 'XL', size: 42 }
                          ].map((preset) => (
                            <button
                              key={preset.size}
                              type="button"
                              onClick={() => updateTextSetting('fontSize', preset.size)}
                              className={`py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                                effectiveTextSettings.fontSize === preset.size
                                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateTextSetting(
                              'fontSize',
                              Math.min(72, effectiveTextSettings.fontSize + 2)
                            )
                          }
                          className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                          title="Increase font size"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Text Style: Bold / Italic / Badge Box */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Format & Style
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateTextSetting('bold', !effectiveTextSettings.bold)}
                          className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                            effectiveTextSettings.bold
                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                          title="Toggle Bold"
                        >
                          <Bold className="w-3.5 h-3.5" />
                          <span>Bold</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => updateTextSetting('italic', !effectiveTextSettings.italic)}
                          className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium italic transition-colors cursor-pointer ${
                            effectiveTextSettings.italic
                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                          title="Toggle Italic"
                        >
                          <Italic className="w-3.5 h-3.5" />
                          <span>Italic</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateTextSetting('hasBackground', !effectiveTextSettings.hasBackground)
                          }
                          className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                            effectiveTextSettings.hasBackground
                              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                          title="Toggle Solid Pill Background"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Badge</span>
                        </button>
                      </div>
                    </div>

                    {/* Live Preview */}
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                        Preview
                      </span>
                      <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center min-h-[46px] overflow-hidden">
                        {effectiveTextSettings.hasBackground ? (
                          <span
                            style={{
                              backgroundColor: currentColor,
                              color: '#ffffff',
                              fontSize: `${Math.min(24, Math.max(12, effectiveTextSettings.fontSize))}px`,
                              fontWeight: effectiveTextSettings.bold ? 'bold' : 'normal',
                              fontStyle: effectiveTextSettings.italic ? 'italic' : 'normal'
                            }}
                            className="px-2.5 py-1 rounded-md shadow-sm truncate max-w-full"
                          >
                            Aa Sample Text
                          </span>
                        ) : (
                          <span
                            style={{
                              color: currentColor,
                              fontSize: `${Math.min(24, Math.max(12, effectiveTextSettings.fontSize))}px`,
                              fontWeight: effectiveTextSettings.bold ? 'bold' : 'normal',
                              fontStyle: effectiveTextSettings.italic ? 'italic' : 'normal'
                            }}
                            className="truncate max-w-full"
                          >
                            Aa Sample Text
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={`relative flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
              }`}
            >
              {t.icon}
              {isActive && (
                <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-1" />

      {/* Color Swatches */}
      <div className="flex items-center gap-1 px-1">
        {COLOR_PRESETS.map((preset) => {
          const isSelected = currentColor.toLowerCase() === preset.value.toLowerCase();
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onColorChange(preset.value)}
              title={`Color: ${preset.name}`}
              className={`w-5 h-5 rounded-full ${preset.twClass} transition-transform flex items-center justify-center relative hover:scale-110 ${
                isSelected
                  ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-900 scale-105'
                  : 'opacity-85 hover:opacity-100'
              }`}
            >
              {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {/* Stroke Width Toggle Popover */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowStylePopup(!showStylePopup)}
          title="Stroke Width"
          className={`flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-medium transition-all ${
            showStylePopup
              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="font-mono">{currentStrokeWidth}px</span>
        </button>

        {showStylePopup && (
          <div className="absolute top-full mt-2 left-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-lg p-2.5 z-30 min-w-[130px] flex flex-col gap-1.5 animate-in fade-in zoom-in-95">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Stroke Width
            </span>
            <div className="flex flex-col gap-1">
              {STROKE_WIDTH_PRESETS.map((stroke) => (
                <button
                  key={stroke.value}
                  type="button"
                  onClick={() => {
                    onStrokeWidthChange(stroke.value);
                    setShowStylePopup(false);
                  }}
                  className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                    currentStrokeWidth === stroke.value
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="bg-current rounded-full"
                      style={{
                        width: '16px',
                        height: `${stroke.value}px`
                      }}
                    />
                    <span>{stroke.label}</span>
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {stroke.value}px
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-1" />

      {/* Undo / Redo Actions */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={`Undo (${undoShortcut})`}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={`Redo (${redoShortcut})`}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-1" />

      {/* Delete Selection & Clear All */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="Delete Selected (Delete / Backspace)"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-25 disabled:pointer-events-none transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Clear All with Confirm */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowClearConfirm(!showClearConfirm)}
            title="Clear all annotations"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {showClearConfirm && (
            <div className="absolute top-full right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-lg p-2.5 z-30 min-w-[160px] animate-in fade-in zoom-in-95">
              <p className="text-[11px] text-zinc-700 dark:text-zinc-300 font-medium mb-2">
                Clear all annotations on this step?
              </p>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2 py-1 rounded text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setShowClearConfirm(false);
                  }}
                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
