import type { StepImageData, SopProject, AnnotationItem, SopStep } from '../../types/sop';
import { normalizeImagePathForRenderer } from '../../store/useSopStore';

/**
 * Loads an image from a path or data URL and returns an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;
    if (src.startsWith('data:image/svg+xml')) {
      try {
        let svgContent = src.substring(src.indexOf(',') + 1);
        try {
          svgContent = decodeURIComponent(svgContent);
        } catch {
          // If already plain text or malformed escape, keep as-is
        }
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      } catch {
        img.src = src;
      }
    } else {
      img.src = normalizeImagePathForRenderer(src) || src;
    }

    img.onload = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(img);
    };
    img.onerror = (e) => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(e);
    };
  });
}

/**
 * Helper to safely draw a rounded rectangle on Canvas 2D
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Draws an individual annotation onto the canvas context.
 * Renders in exact KonvaCanvas visual style.
 */
function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  anno: AnnotationItem,
  img: HTMLImageElement,
  scaleX: number,
  scaleY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const avgScale = (scaleX + scaleY) / 2;

  // 1. Badge Annotation
  if (anno.type === 'badge') {
    const radius = (anno.radius || 14) * avgScale;
    const x = anno.x * scaleX;
    const y = anno.y * scaleY;

    ctx.save();
    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 6 * avgScale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * avgScale;

    // Outer white stroke & filled circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = anno.fillColor || '#2563eb';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = anno.strokeColor || '#ffffff';
    ctx.lineWidth = (anno.strokeWidth || 2) * avgScale;
    ctx.stroke();

    // Centered number text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(13 * avgScale)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(anno.badgeNumber || 1), x, y + 0.5 * avgScale);
    ctx.restore();
    return;
  }

  // 2. Rectangle Highlight Box
  if (anno.type === 'rectangle') {
    const x = anno.x * scaleX;
    const y = anno.y * scaleY;
    const w = (anno.width || 120) * scaleX;
    const h = (anno.height || 60) * scaleY;
    const r = (anno.radius ?? 6) * avgScale;

    ctx.save();
    if (anno.rotation) {
      ctx.translate(x, y);
      ctx.rotate((anno.rotation * Math.PI) / 180);
      ctx.translate(-x, -y);
    }

    ctx.beginPath();
    drawRoundedRect(ctx, x, y, w, h, r);

    if (anno.fillColor && anno.fillColor !== 'transparent') {
      ctx.fillStyle = anno.fillColor;
      ctx.fill();
    }

    ctx.strokeStyle = anno.strokeColor || '#ef4444';
    ctx.lineWidth = (anno.strokeWidth || 3) * avgScale;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 3. Arrow Pointer
  if (anno.type === 'arrow') {
    const points = anno.points || [0, 0, 80, 0];
    const tailX = (anno.x + points[0]) * scaleX;
    const tailY = (anno.y + points[1]) * scaleY;
    const tipX = (anno.x + points[2]) * scaleX;
    const tipY = (anno.y + points[3]) * scaleY;
    const strokeColor = anno.strokeColor || '#2563eb';
    const strokeWidth = (anno.strokeWidth || 3) * avgScale;

    const dx = tipX - tailX;
    const dy = tipY - tailY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const pointerLength = 12 * avgScale;
    const pointerWidth = 12 * avgScale;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Shaft line stopping before the arrowhead point
    const baseDist = Math.max(0, length - pointerLength + 2 * avgScale);
    const baseX = tailX + Math.cos(angle) * baseDist;
    const baseY = tailY + Math.sin(angle) * baseDist;

    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(baseX, baseY);
    ctx.stroke();

    // Arrowhead triangle
    const p1x = tipX - pointerLength * Math.cos(angle) + (pointerWidth / 2) * Math.sin(angle);
    const p1y = tipY - pointerLength * Math.sin(angle) - (pointerWidth / 2) * Math.cos(angle);
    const p2x = tipX - pointerLength * Math.cos(angle) - (pointerWidth / 2) * Math.sin(angle);
    const p2y = tipY - pointerLength * Math.sin(angle) + (pointerWidth / 2) * Math.cos(angle);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 4. Blur / Redaction Box
  if (anno.type === 'blur') {
    const x = anno.x * scaleX;
    const y = anno.y * scaleY;
    const w = (anno.width || 120) * scaleX;
    const h = (anno.height || 40) * scaleY;
    const r = (anno.radius ?? 4) * avgScale;

    ctx.save();
    if (anno.rotation) {
      ctx.translate(x, y);
      ctx.rotate((anno.rotation * Math.PI) / 180);
      ctx.translate(-x, -y);
    }

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 6 * avgScale;
    ctx.beginPath();
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = anno.fillColor || '#09090b';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = anno.strokeColor || '#27272a';
    ctx.lineWidth = (anno.strokeWidth || 1) * avgScale;
    ctx.stroke();

    // Centered REDACTED text
    ctx.fillStyle = '#71717a';
    ctx.globalAlpha = 0.75;
    ctx.font = `bold ${Math.round(10 * avgScale)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('REDACTED', x + w / 2, y + h / 2);
    ctx.restore();
    return;
  }

  // 5. Zoom Loupe (Magnifier)
  if (anno.type === 'zoom_loupe') {
    const loupeRadius = (anno.radius || 90) * avgScale;
    const loupeX = anno.x * scaleX;
    const loupeY = anno.y * scaleY;

    const rawTargetX = anno.targetArea?.x ?? anno.x - 110;
    const rawTargetY = anno.targetArea?.y ?? anno.y + 110;
    const targetX = rawTargetX * scaleX;
    const targetY = rawTargetY * scaleY;

    const zoomFactor = anno.zoomFactor || 2;
    const strokeColor = anno.strokeColor || '#2563eb';
    const strokeWidth = (anno.strokeWidth || 3) * avgScale;

    // Calculate vector from target to loupe center
    const dx = loupeX - targetX;
    const dy = loupeY - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Stop line at edge of loupe lens
    const edgeX = distance > loupeRadius ? loupeX - Math.cos(angle) * loupeRadius : loupeX;
    const edgeY = distance > loupeRadius ? loupeY - Math.sin(angle) * loupeRadius : loupeY;

    // A. Anchor Connecting Dashed Line
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4 * avgScale, 3 * avgScale]);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2 * avgScale;
    ctx.moveTo(targetX, targetY);
    ctx.lineTo(edgeX, edgeY);
    ctx.stroke();
    ctx.restore();

    // B. Target Anchor Dot on Screenshot
    ctx.save();
    // Outer ring
    ctx.beginPath();
    ctx.arc(targetX, targetY, 10 * avgScale, 0, Math.PI * 2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1 * avgScale;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Inner circle with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4 * avgScale;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 5 * avgScale, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * avgScale;
    ctx.stroke();
    ctx.restore();

    // C. Magnifier Lens: Clipped circular magnified viewport
    // Using translate + scale inside the circular clip is 100% immune to IndexSizeError
    // regardless of where targetArea is located (even near or beyond screenshot boundaries).
    ctx.save();
    ctx.beginPath();
    ctx.arc(loupeX, loupeY, loupeRadius, 0, Math.PI * 2);
    ctx.clip();

    // Base background for lens
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Center the targetArea point inside the magnified circular lens
    ctx.translate(loupeX, loupeY);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.drawImage(img, -targetX, -targetY, canvasWidth, canvasHeight);
    ctx.restore();

    // D. Lens Border & Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12 * avgScale;
    ctx.shadowOffsetY = 4 * avgScale;
    ctx.beginPath();
    ctx.arc(loupeX, loupeY, loupeRadius, 0, Math.PI * 2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.restore();

    // E. Zoom Factor Pill Badge on top-right of lens
    ctx.save();
    const badgeX = loupeX + Math.round(loupeRadius * 0.707);
    const badgeY = loupeY + Math.round(-loupeRadius * 0.707);
    const bw = 32 * avgScale;
    const bh = 18 * avgScale;
    const bx = badgeX - bw / 2;
    const by = badgeY - bh / 2;
    const br = 9 * avgScale;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4 * avgScale;
    ctx.beginPath();
    drawRoundedRect(ctx, bx, by, bw, bh, br);
    ctx.fillStyle = strokeColor;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * avgScale;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(10 * avgScale)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${zoomFactor}x`, badgeX, badgeY + 0.5 * avgScale);
    ctx.restore();
    return;
  }

  // 6. Text Callout Tool
  if (anno.type === 'text') {
    const textContent = anno.text || 'Label callout';
    const fontSize = (anno.fontSize || 22) * avgScale;
    const isBold = anno.fontWeight !== 'normal';
    const isItalic = anno.fontStyle === 'italic';
    const fontStyleStr = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${Math.round(fontSize)}px system-ui, -apple-system, sans-serif`;
    const x = anno.x * scaleX;
    const y = anno.y * scaleY;

    ctx.save();
    if (anno.rotation) {
      ctx.translate(x, y);
      ctx.rotate((anno.rotation * Math.PI) / 180);
      ctx.translate(-x, -y);
    }
    ctx.font = fontStyleStr;

    const measured = ctx.measureText(textContent);
    const textWidth = Math.max(40 * avgScale, measured.width);
    const paddingX = Math.round(fontSize * 0.65);
    const paddingY = Math.round(fontSize * 0.35);
    const pillWidth = Math.round(textWidth + paddingX * 2);
    const pillHeight = Math.round(fontSize + paddingY * 2);

    if (anno.hasBackground !== false) {
      // Pill Background with Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 8 * avgScale;
      ctx.shadowOffsetY = 2 * avgScale;

      ctx.beginPath();
      drawRoundedRect(ctx, x, y, pillWidth, pillHeight, pillHeight / 2);
      ctx.fillStyle = anno.fillColor || '#2563eb';
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textContent, x + pillWidth / 2, y + pillHeight / 2 + 0.5 * avgScale);
    } else {
      // Text only with drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6 * avgScale;
      ctx.shadowOffsetY = 2 * avgScale;

      ctx.fillStyle = anno.fillColor || '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(textContent, x, y);
    }
    ctx.restore();
  }
}

/**
 * Composites the screenshot image and ALL its annotations (badges, rectangles,
 * arrows, blur redactions, zoom loupe magnifier, text callouts) onto an offscreen canvas
 * and returns a PNG data URL.
 * Preserves the exact creation/stacking order of annotations.
 */
export async function renderAnnotatedImage(image?: StepImageData): Promise<string | null> {
  if (!image || !image.originalImagePath) {
    return null;
  }

  // If already composited and cached, return the cache
  if (image.annotatedCachePath && image.annotatedCachePath === image.originalImagePath) {
    return image.annotatedCachePath;
  }

  // If we are not in a browser environment with Canvas support, return original
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return image.originalImagePath;
  }

  try {
    const img = await loadImage(image.originalImagePath);
    const canvas = document.createElement('canvas');
    const naturalWidth = img.naturalWidth || image.dimensions?.width || 960;
    const naturalHeight = img.naturalHeight || image.dimensions?.height || 540;
    const storedWidth = image.dimensions?.width || naturalWidth;
    const storedHeight = image.dimensions?.height || naturalHeight;

    // Older projects may keep stale default dimensions (e.g. 1280x720).
    // Prefer native image dimensions for export compositing if dimensions disagree.
    const hasStaleDimensions =
      Math.abs(storedWidth - naturalWidth) > 2 || Math.abs(storedHeight - naturalHeight) > 2;

    const width = naturalWidth;
    const height = naturalHeight;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return image.originalImagePath;
    }

    // Draw base screenshot
    ctx.drawImage(img, 0, 0, width, height);

    // If no annotations, export directly as PNG
    if (!image.annotations || image.annotations.length === 0) {
      return canvas.toDataURL('image/png');
    }

    const nativeW = hasStaleDimensions ? naturalWidth : storedWidth;
    const nativeH = hasStaleDimensions ? naturalHeight : storedHeight;
    const scaleX = width / nativeW;
    const scaleY = height / nativeH;

    // Draw all annotations in exact array sequence (preserves bottom-to-top z-order)
    for (const anno of image.annotations) {
      drawAnnotation(ctx, anno, img, scaleX, scaleY, width, height);
    }

    const dataUrl = canvas.toDataURL('image/png');
    // Release 2D canvas backing store from memory
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch (err) {
    console.warn('Could not composite annotations on canvas:', err);
    return image.originalImagePath;
  }
}

/**
 * Normalizes and pre-renders all steps in an SOP project for export.
 * - Guarantees sequential ordering by step.order (1..N).
 * - Pre-renders screenshots with all annotations into portable base64 PNGs.
 * - Prevents double-rendering down the pipeline.
 */
export async function prepareExportProject(project: SopProject): Promise<SopProject> {
  // 1. Sort steps strictly by step.order
  const sortedSteps = [...(project.steps || [])].sort((a, b) => a.order - b.order);

  // 2. Pre-render screenshot steps with annotations in small concurrent batches (max 4 concurrent)
  // to prevent memory spikes / OOM during large project exports.
  const preparedSteps: SopStep[] = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < sortedSteps.length; i += BATCH_SIZE) {
    const batch = sortedSteps.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (step) => {
        if (step.type === 'screenshot' && step.image?.originalImagePath) {
          try {
            const rendered = await renderAnnotatedImage(step.image);
            let normalizedDimensions = step.image.dimensions;

            try {
              const dimProbe = await loadImage(rendered || step.image.originalImagePath);
              normalizedDimensions = {
                width: dimProbe.naturalWidth || normalizedDimensions.width,
                height: dimProbe.naturalHeight || normalizedDimensions.height,
              };
            } catch {
              // Keep existing dimensions if probing fails.
            }

            if (rendered && rendered.startsWith('data:image/') && rendered.includes(';base64,')) {
              return {
                ...step,
                image: {
                  ...step.image,
                  originalImagePath: rendered,
                  dimensions: normalizedDimensions,
                  annotatedCachePath: rendered,
                },
              };
            }

            return {
              ...step,
              image: {
                ...step.image,
                dimensions: normalizedDimensions,
              },
            };
          } catch (err) {
            console.warn('[prepareExportProject] Error rendering step image:', err);
          }
        }
        return step;
      })
    );
    preparedSteps.push(...batchResults);
  }

  return {
    ...project,
    steps: preparedSteps,
  };
}

/**
 * Helper to trigger browser download for a Blob or string
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Sanitize filename
 */
export function getSafeFileName(projectName: string, extension: string): string {
  const safe = projectName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${safe || 'sop'}.${extension}`;
}
