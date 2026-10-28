import React, { useMemo } from 'react';
import {
  Building2,
  User,
  Calendar,
  Layers,
  Eye
} from 'lucide-react';
import { useSopStore } from '../../store/useSopStore';
import {
  CoverPageSettings,
  DEFAULT_COVER_PAGE_SETTINGS
} from '../../types/sop';

export const GRADIENT_PRESETS = [
  {
    name: 'Samsung Blue',
    value: 'linear-gradient(135deg, #1428A0 0%, #0077C8 55%, #00B3E3 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Samsung Teal',
    value: 'linear-gradient(135deg, #1428A0 0%, #00B3E3 45%, #00C3B2 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Midnight Slate',
    value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Royal Navy',
    value: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Emerald Aurora',
    value: 'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Obsidian Indigo',
    value: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 50%, #09090b 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Sunset Plum',
    value: 'linear-gradient(135deg, #581c87 0%, #2e1065 50%, #0f172a 100%)',
    textColor: '#ffffff'
  },
  {
    name: 'Executive Frost',
    value: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)',
    textColor: '#0f172a'
  }
];

export const COLOR_PRESETS = [
  { name: 'Samsung Blue', value: '#1428A0', textColor: '#ffffff' },
  { name: 'Sky Blue', value: '#0077C8', textColor: '#ffffff' },
  { name: 'Sea Blue', value: '#00B3E3', textColor: '#ffffff' },
  { name: 'Teal', value: '#00C3B2', textColor: '#ffffff' },
  { name: 'Cloud', value: '#F2F4F7', textColor: '#000000' },
  { name: 'Charcoal', value: '#595D63', textColor: '#ffffff' },
  { name: 'Pebble', value: '#808387', textColor: '#ffffff' },
  { name: 'Black', value: '#000000', textColor: '#ffffff' },
  { name: 'White', value: '#FFFFFF', textColor: '#000000' },
  { name: 'Deep Slate', value: '#0f172a', textColor: '#ffffff' },
  { name: 'Pitch Black', value: '#18181b', textColor: '#ffffff' },
  { name: 'Corporate Navy', value: '#1e3a8a', textColor: '#ffffff' },
  { name: 'Emerald Forest', value: '#064e3b', textColor: '#ffffff' },
  { name: 'Royal Indigo', value: '#312e81', textColor: '#ffffff' },
  { name: 'Ruby Dark', value: '#4c0519', textColor: '#ffffff' },
  { name: 'Clean White', value: '#ffffff', textColor: '#0f172a' },
  { name: 'Light Gray', value: '#f1f5f9', textColor: '#0f172a' }
];

export const CoverPageStudio: React.FC = () => {
  const { activeProject, updateCoverPageSettings } =
    useSopStore();

  const formattedDate = useMemo(() => {
    try {
      const raw = activeProject?.updatedAt || activeProject?.createdAt;
      const d = raw ? new Date(raw) : new Date();
      if (isNaN(d.getTime())) return new Date().toLocaleDateString();
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return new Date().toLocaleDateString();
    }
  }, [activeProject]);

  if (!activeProject) return null;

  const cover: CoverPageSettings = {
    ...DEFAULT_COVER_PAGE_SETTINGS,
    title: activeProject.name,
    subtitle: activeProject.description || '',
    author: activeProject.author || '',
    organization: activeProject.department || 'Operations Team',
    version: activeProject.version || '1.0.0',
    ...(activeProject.coverPage || {})
  };

  const isHexColorLight = (hex?: string): boolean => {
    if (!hex || !hex.startsWith('#')) return false;
    const clean = hex.replace('#', '');
    if (clean.length !== 6 && clean.length !== 3) return false;
    const r = parseInt(clean.length === 3 ? clean[0] + clean[0] : clean.substring(0, 2), 16);
    const g = parseInt(clean.length === 3 ? clean[1] + clean[1] : clean.substring(2, 4), 16);
    const b = parseInt(clean.length === 3 ? clean[2] + clean[2] : clean.substring(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6;
  };

  const isLightBackground =
    (cover.backgroundType === 'color' && isHexColorLight(cover.backgroundColor)) ||
    (cover.backgroundType === 'gradient' && Boolean(cover.backgroundGradient?.includes('#ffffff') || cover.backgroundGradient?.includes('#f8fafc')));

  const textColor = isLightBackground ? '#0f172a' : '#ffffff';
  const subtextColor = isLightBackground ? '#475569' : '#94a3b8';
  const badgeBorder = isLightBackground ? 'rgba(15,23,42,0.15)' : 'rgba(255,255,255,0.2)';
  const cardBg = isLightBackground ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.06)';

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto bg-zinc-100/60 dark:bg-zinc-950/60 p-4 md:p-8 items-center select-none">
      {/* Main Workspace: Side Controls & WYSIWYG Live Page */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-start justify-center gap-6 pb-12">
        {/* Left Column: Live A4 Document Sheet Preview */}
        <div className="flex-1 flex flex-col items-center w-full">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            <span>Live Front Page Preview (A4 Aspect Ratio)</span>
          </div>

          {/* The A4 Document Page */}
          <div
            style={{
              background:
                cover.backgroundType === 'image' && cover.backgroundImage
                  ? `url(${cover.backgroundImage}) center/cover no-repeat`
                  : cover.backgroundType === 'gradient'
                  ? cover.backgroundGradient || DEFAULT_COVER_PAGE_SETTINGS.backgroundGradient
                  : cover.backgroundColor || '#0f172a'
            }}
            className="relative w-full max-w-[560px] aspect-[1/1.414] rounded-xl shadow-2xl overflow-hidden border border-zinc-300/60 dark:border-zinc-700/60 transition-all flex flex-col justify-between select-text"
          >
            {/* Optional Dark / Color Overlay on Image or Gradient for crystal-clear readability */}
            {cover.backgroundType === 'image' && (
              <div
                style={{
                  backgroundColor: `rgba(0, 0, 0, ${cover.backgroundOverlayOpacity ?? 0.45})`
                }}
                className="absolute inset-0 pointer-events-none z-0"
              />
            )}

            {/* Top Accent Ribbon / Status Bar */}
            <div className="relative z-10 p-6 md:p-8 flex items-center justify-between">
              <div
                style={{
                  backgroundColor: cardBg,
                  borderColor: badgeBorder,
                  color: textColor
                }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wider uppercase backdrop-blur-md"
              >
                <span>Standard Operating Procedure</span>
              </div>

              {cover.showVersion && (
                <div
                  style={{
                    backgroundColor: cardBg,
                    borderColor: badgeBorder,
                    color: subtextColor
                  }}
                  className="px-2.5 py-1 rounded-md border text-[10px] font-mono font-medium backdrop-blur-md"
                >
                  v{cover.version || activeProject.version || '1.0.0'}
                </div>
              )}
            </div>

            {/* Middle Section: Hero Titles & Layout Design */}
            <div className="relative z-10 px-6 md:px-8 my-auto flex flex-col justify-center">
              {cover.layout === 'executive' && (
                <div
                  style={{ borderColor: badgeBorder }}
                  className="w-16 h-1 mb-4 bg-blue-500 rounded-full"
                />
              )}

              <h1
                style={{ color: textColor }}
                className={`font-black tracking-tight leading-tight ${
                  cover.layout === 'bold'
                    ? 'text-3xl md:text-4xl uppercase'
                    : 'text-2xl md:text-3xl'
                }`}
              >
                {cover.title || activeProject.name || 'Standard Operating Procedure'}
              </h1>

              {cover.subtitle && (
                <p
                  style={{ color: subtextColor }}
                  className="text-xs md:text-sm mt-3 leading-relaxed max-w-lg font-normal"
                >
                  {cover.subtitle}
                </p>
              )}

              {/* Layout Decorative Line */}
              {cover.layout === 'modern' && (
                <div className="mt-6 flex items-center gap-2">
                  <div className="h-1 w-12 bg-blue-500 rounded-full" />
                  <div className="h-0.5 flex-1 bg-white/20 rounded-full" />
                </div>
              )}
            </div>

            {/* Bottom Metadata Block */}
            <div className="relative z-10 p-6 md:p-8 border-t border-white/10 dark:border-white/5 backdrop-blur-sm">
              <div className="grid grid-cols-2 gap-3 text-left">
                {cover.showAuthor && (
                  <div
                    style={{ backgroundColor: cardBg, borderColor: badgeBorder }}
                    className="p-2.5 rounded-lg border backdrop-blur-md flex items-center gap-2.5"
                  >
                    <User style={{ color: subtextColor }} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div
                        style={{ color: subtextColor }}
                        className="text-[9px] uppercase tracking-wider font-semibold"
                      >
                        Author
                      </div>
                      <div
                        style={{ color: textColor }}
                        className="text-xs font-semibold truncate"
                      >
                        {cover.author || activeProject.author || 'StepFlow Team'}
                      </div>
                    </div>
                  </div>
                )}

                {cover.showOrganization && (
                  <div
                    style={{ backgroundColor: cardBg, borderColor: badgeBorder }}
                    className="p-2.5 rounded-lg border backdrop-blur-md flex items-center gap-2.5"
                  >
                    <Building2 style={{ color: subtextColor }} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div
                        style={{ color: subtextColor }}
                        className="text-[9px] uppercase tracking-wider font-semibold"
                      >
                        Department / Org
                      </div>
                      <div
                        style={{ color: textColor }}
                        className="text-xs font-semibold truncate"
                      >
                        {cover.organization || activeProject.department || 'Operations'}
                      </div>
                    </div>
                  </div>
                )}

                {cover.showDate && (
                  <div
                    style={{ backgroundColor: cardBg, borderColor: badgeBorder }}
                    className="p-2.5 rounded-lg border backdrop-blur-md flex items-center gap-2.5"
                  >
                    <Calendar style={{ color: subtextColor }} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div
                        style={{ color: subtextColor }}
                        className="text-[9px] uppercase tracking-wider font-semibold"
                      >
                        Publication Date
                      </div>
                      <div
                        style={{ color: textColor }}
                        className="text-xs font-semibold truncate"
                      >
                        {formattedDate}
                      </div>
                    </div>
                  </div>
                )}

                <div
                  style={{ backgroundColor: cardBg, borderColor: badgeBorder }}
                  className="p-2.5 rounded-lg border backdrop-blur-md flex items-center gap-2.5"
                >
                  <Layers style={{ color: subtextColor }} className="w-4 h-4 shrink-0" />
                  <div className="min-w-0">
                    <div
                      style={{ color: subtextColor }}
                      className="text-[9px] uppercase tracking-wider font-semibold"
                    >
                      Scope
                    </div>
                    <div
                      style={{ color: textColor }}
                      className="text-xs font-semibold truncate"
                    >
                      {activeProject.steps.length} Steps
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
