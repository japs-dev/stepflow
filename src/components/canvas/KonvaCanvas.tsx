import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef
} from 'react';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Circle,
  Arrow as KonvaArrow,
  Line,
  Text as KonvaText,
  Group,
  Transformer
} from 'react-konva';
import Konva from 'konva';
import { Check } from 'lucide-react';
import { AnnotationItem, TextSettings, LoupeSettings } from '../../types/sop';
import { ToolType } from './AnnotationToolbar';

export interface KonvaCanvasHandle {
  exportToPng: () => string | null;
  getStage: () => Konva.Stage | null;
}

export interface KonvaCanvasProps {
  imageSrc: string;
  annotations: AnnotationItem[];
  onChangeAnnotations: (annotations: AnnotationItem[]) => void;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  textSettings?: TextSettings;
  loupeSettings?: LoupeSettings;
  onToolUsed?: (tool: ToolType) => void;
  onImageCropped?: (newImageSrc: string, updatedAnnotations: AnnotationItem[]) => void;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  zoomLevel?: 'fit' | '100%';
  zoomPercent?: number;
  maxDisplayWidth?: number;
  className?: string;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const KonvaCanvas = forwardRef<KonvaCanvasHandle, KonvaCanvasProps>(
  (
    {
      imageSrc,
      annotations,
      onChangeAnnotations,
      activeTool,
      currentColor,
      currentStrokeWidth,
      textSettings,
      loupeSettings,
      onToolUsed,
      onImageCropped,
      selectedId,
      onSelectId,
      zoomLevel = 'fit',
      zoomPercent,
      maxDisplayWidth = 820,
      className = ''
    },
    ref
  ) => {
    const stageRef = useRef<Konva.Stage | null>(null);
    const transformerRef = useRef<Konva.Transformer | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Image loading state
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
      width: 960,
      height: 540
    });

    // Drawing state for drag-to-create tools (rect, arrow, blur)
    const [drawing, setDrawing] = useState<DrawingState>({
      isDrawing: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0
    });

    // Inline text editing state
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState<string>('');

    // Crop selection state
    const [cropSelection, setCropSelection] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);

    // Reset crop state when active tool changes away from crop or image changes
    useEffect(() => {
      if (activeTool !== 'crop') {
        setCropSelection(null);
      }
    }, [activeTool, imageSrc]);

    // Load Image
    useEffect(() => {
      let isMounted = true;
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = imageSrc;

      img.onload = () => {
        if (!isMounted) return;
        const width = img.naturalWidth || 960;
        const height = img.naturalHeight || 540;
        setImageElement(img);
        setImageDimensions({ width, height });
      };

      return () => {
        isMounted = false;
      };
    }, [imageSrc]);

    // Commit annotations directly to parent controller (CenterViewport manages undo/redo stack)
    const commitAnnotations = useCallback(
      (newAnnotations: AnnotationItem[]) => {
        onChangeAnnotations(newAnnotations);
      },
      [onChangeAnnotations]
    );

    // Expose export and stage methods via ref
    useImperativeHandle(
      ref,
      () => ({
        exportToPng: () => {
          const stage = stageRef.current;
          if (!stage) return null;

          // Detach transformer temporarily so selection frame is not captured
          const currentNodes = transformerRef.current?.nodes() || [];
          if (transformerRef.current) {
            transformerRef.current.nodes([]);
            transformerRef.current.getLayer()?.batchDraw();
          }

          const nativeWidth = imageDimensions.width || 960;
          const displayW = stage.width();
          const rawRatio = displayW > 0 ? nativeWidth / displayW : 1;
          const pixelRatio = Math.max(0.5, Math.min(rawRatio, 4));

          const dataUrl = stage.toDataURL({
            pixelRatio,
            mimeType: 'image/png'
          });

          // Restore transformer selection
          if (transformerRef.current && currentNodes.length > 0) {
            transformerRef.current.nodes(currentNodes);
            transformerRef.current.getLayer()?.batchDraw();
          }

          return dataUrl;
        },
        getStage: () => stageRef.current
      }),
      [imageDimensions]
    );

    // Calculate Stage Display Size and Scale
    const nativeWidth = imageDimensions.width || 960;
    const nativeHeight = imageDimensions.height || 540;
    const aspectRatio = nativeHeight / nativeWidth;

    let displayWidth = nativeWidth;
    let displayHeight = nativeHeight;

    if (zoomPercent !== undefined) {
      // Use logical reference width: for large screenshots (e.g. 2560px), reference 100% width is 1000px
      const baseReferenceWidth = Math.min(1000, Math.max(480, nativeWidth));
      displayWidth = Math.round(baseReferenceWidth * (zoomPercent / 100));
      displayHeight = Math.round(displayWidth * aspectRatio);
    } else if (zoomLevel === 'fit') {
      displayWidth = Math.min(maxDisplayWidth, nativeWidth);
      displayHeight = Math.round(displayWidth * aspectRatio);
    }

    const scale = displayWidth / nativeWidth;

    // Attach / Detach Transformer when selection changes
    useEffect(() => {
      if (!transformerRef.current || !stageRef.current) return;

      if (!selectedId || activeTool !== 'select') {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
        return;
      }

      const stage = stageRef.current;
      const selectedNode = stage.findOne(`#${selectedId}`);

      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }, [selectedId, annotations, activeTool]);

    // Convert mouse/pointer event on stage to Native Image Coordinates
    const getNativePointerPos = useCallback((): { x: number; y: number } | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const pos = stage.getPointerPosition();
      if (!pos) return null;

      // Invert stage transform
      return {
        x: Math.round(pos.x / scale),
        y: Math.round(pos.y / scale)
      };
    }, [scale]);

    // Handle Stage Mouse Down
    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // If clicked on empty stage or background image
      const isStageOrImage =
        e.target === e.target.getStage() || e.target.name() === 'background-image';

      const point = getNativePointerPos();
      if (!point) return;

      if (activeTool === 'select') {
        if (isStageOrImage) {
          onSelectId(null);
        }
        return;
      }

      // Crop tool: Start defining crop rectangle
      if (activeTool === 'crop') {
        setCropSelection(null);
        setDrawing({
          isDrawing: true,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y
        });
        return;
      }

      // 1. Badge tool: instant placement on click
      if (activeTool === 'badge') {
        const existingNumbers = annotations
          .filter((a) => a.type === 'badge')
          .map((a) => a.badgeNumber || 0);
        const nextBadgeNumber =
          existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

        const newBadge: AnnotationItem = {
          id: `badge-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'badge',
          x: point.x,
          y: point.y,
          badgeNumber: nextBadgeNumber,
          fillColor: currentColor,
          strokeColor: '#ffffff',
          strokeWidth: 2,
          radius: 14
        };

        const updated = [...annotations, newBadge];
        commitAnnotations(updated);
        onSelectId(newBadge.id);
        if (onToolUsed) onToolUsed('badge');
        return;
      }

      // 2. Zoom Loupe tool: instant placement with target anchor
      if (activeTool === 'zoom_loupe') {
        const targetX = point.x;
        const targetY = point.y;
        const initialRadius = loupeSettings?.radius || 90;
        const initialZoom = loupeSettings?.zoomFactor || 2;
        // Position loupe offset from target, taking radius into account
        const loupeX = Math.min(nativeWidth - initialRadius - 20, Math.max(initialRadius + 20, targetX + initialRadius + 30));
        const loupeY = Math.max(initialRadius + 20, targetY - initialRadius - 30);

        const newLoupe: AnnotationItem = {
          id: `loupe-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'zoom_loupe',
          x: loupeX,
          y: loupeY,
          radius: initialRadius,
          zoomFactor: initialZoom,
          targetArea: {
            x: targetX,
            y: targetY,
            width: initialRadius,
            height: initialRadius
          },
          strokeColor: currentColor,
          strokeWidth: 3
        };

        const updated = [...annotations, newLoupe];
        commitAnnotations(updated);
        onSelectId(newLoupe.id);
        if (onToolUsed) onToolUsed('select');
        return;
      }

      // 3. Text tool: instant placement and open editor
      if (activeTool === 'text') {
        const effectiveFontSize = textSettings?.fontSize || 22;
        const newText: AnnotationItem = {
          id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'text',
          x: point.x,
          y: point.y,
          text: 'Label callout',
          fillColor: currentColor,
          strokeColor: '#ffffff',
          fontSize: effectiveFontSize,
          fontWeight: textSettings?.bold !== false ? 'bold' : 'normal',
          fontStyle: textSettings?.italic ? 'italic' : 'normal',
          hasBackground: textSettings?.hasBackground !== false
        };

        const updated = [...annotations, newText];
        commitAnnotations(updated);
        onSelectId(newText.id);
        setEditingTextId(newText.id);
        setEditingTextValue('Label callout');
        if (onToolUsed) onToolUsed('select');
        return;
      }

      // 4. Drag-to-draw tools (rectangle, arrow, blur)
      if (activeTool === 'rectangle' || activeTool === 'arrow' || activeTool === 'blur') {
        setDrawing({
          isDrawing: true,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y
        });
      }
    };

    // Handle Stage Mouse Move (while drawing)
    const handleStageMouseMove = () => {
      if (!drawing.isDrawing) return;
      const point = getNativePointerPos();
      if (!point) return;

      setDrawing((prev) => ({
        ...prev,
        currentX: point.x,
        currentY: point.y
      }));
    };

    // Handle Stage Mouse Up (commit drawn item)
    const handleStageMouseUp = () => {
      if (!drawing.isDrawing) return;
      const { startX, startY, currentX, currentY } = drawing;
      setDrawing((prev) => ({ ...prev, isDrawing: false }));

      const dx = currentX - startX;
      const dy = currentY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (activeTool === 'crop') {
        const width = Math.abs(dx);
        const height = Math.abs(dy);
        if (width > 20 && height > 20) {
          setCropSelection({
            x: Math.round(Math.min(startX, currentX)),
            y: Math.round(Math.min(startY, currentY)),
            width: Math.round(width),
            height: Math.round(height)
          });
        }
        return;
      }

      if (activeTool === 'rectangle') {
        const width = Math.abs(dx);
        const height = Math.abs(dy);
        const minSize = 6;

        const finalX = width > minSize ? Math.min(startX, currentX) : startX - 60;
        const finalY = height > minSize ? Math.min(startY, currentY) : startY - 30;
        const finalW = width > minSize ? width : 120;
        const finalH = height > minSize ? height : 60;

        const newRect: AnnotationItem = {
          id: `rect-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'rectangle',
          x: Math.round(finalX),
          y: Math.round(finalY),
          width: Math.round(finalW),
          height: Math.round(finalH),
          strokeColor: currentColor,
          strokeWidth: currentStrokeWidth,
          fillColor: 'transparent',
          radius: 6
        };

        const updated = [...annotations, newRect];
        commitAnnotations(updated);
        onSelectId(newRect.id);
        if (onToolUsed) onToolUsed('select');
      } else if (activeTool === 'blur') {
        const width = Math.abs(dx);
        const height = Math.abs(dy);
        const minSize = 6;

        const finalX = width > minSize ? Math.min(startX, currentX) : startX - 60;
        const finalY = height > minSize ? Math.min(startY, currentY) : startY - 20;
        const finalW = width > minSize ? width : 120;
        const finalH = height > minSize ? height : 40;

        const newBlur: AnnotationItem = {
          id: `blur-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'blur',
          x: Math.round(finalX),
          y: Math.round(finalY),
          width: Math.round(finalW),
          height: Math.round(finalH),
          fillColor: '#09090b',
          strokeColor: '#27272a',
          strokeWidth: 1,
          radius: 4,
          redactionMode: 'blackout'
        };

        const updated = [...annotations, newBlur];
        commitAnnotations(updated);
        onSelectId(newBlur.id);
        if (onToolUsed) onToolUsed('select');
      } else if (activeTool === 'arrow') {
        let arrowDx = dx;
        let arrowDy = dy;
        if (dist < 10) {
          arrowDx = 90;
          arrowDy = 0;
        }

        const newArrow: AnnotationItem = {
          id: `arrow-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          type: 'arrow',
          x: Math.round(startX),
          y: Math.round(startY),
          points: [0, 0, Math.round(arrowDx), Math.round(arrowDy)],
          strokeColor: currentColor,
          strokeWidth: Math.max(3, currentStrokeWidth),
          fillColor: currentColor
        };

        const updated = [...annotations, newArrow];
        commitAnnotations(updated);
        onSelectId(newArrow.id);
        if (onToolUsed) onToolUsed('select');
      }
    };

    // Update single annotation in place
    const updateAnnotationItem = useCallback(
      (id: string, updates: Partial<AnnotationItem>) => {
        const updated = annotations.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        );
        commitAnnotations(updated);
      },
      [annotations, commitAnnotations]
    );

    // Transform End Handler
    const handleTransformEnd = (id: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const rotation = node.rotation();

      // Reset node scale back to 1 and update width/height
      node.scaleX(1);
      node.scaleY(1);

      const newWidth = Math.max(10, Math.round(node.width() * scaleX));
      const newHeight = Math.max(10, Math.round(node.height() * scaleY));

      updateAnnotationItem(id, {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
        rotation: Math.round(rotation)
      });
    };

    // Double-click to edit text
    const handleTextDblClick = (item: AnnotationItem) => {
      setEditingTextId(item.id);
      setEditingTextValue(item.text || '');
    };

    const finishTextEditing = () => {
      if (editingTextId) {
        updateAnnotationItem(editingTextId, { text: editingTextValue.trim() || 'Label' });
        setEditingTextId(null);
      }
    };

    // Cycle Zoom Loupe Magnification presets (1.5x, 2x, 2.5x, 3x, 4x)
    const LOUPE_ZOOM_LEVELS = [1.5, 2, 2.5, 3, 4];
    const cycleLoupeZoom = (item: AnnotationItem) => {
      const currentZoom = item.zoomFactor || 2;
      const currentIdx = LOUPE_ZOOM_LEVELS.findIndex((z) => Math.abs(z - currentZoom) < 0.1);
      const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % LOUPE_ZOOM_LEVELS.length;
      updateAnnotationItem(item.id, { zoomFactor: LOUPE_ZOOM_LEVELS[nextIdx] });
    };

    const editingItem = annotations.find((a) => a.id === editingTextId);

    const handleApplyCrop = () => {
      if (!cropSelection || !imageElement) return;

      const cropX = Math.max(0, Math.min(nativeWidth, cropSelection.x));
      const cropY = Math.max(0, Math.min(nativeHeight, cropSelection.y));
      const cropW = Math.max(10, Math.min(nativeWidth - cropX, cropSelection.width));
      const cropH = Math.max(10, Math.min(nativeHeight - cropY, cropSelection.height));

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = Math.round(cropW);
      offscreenCanvas.height = Math.round(cropH);
      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(
        imageElement,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      );

      const croppedDataUrl = offscreenCanvas.toDataURL('image/png');

      // Adjust existing annotations: shift coordinates by -cropX, -cropY
      const adjustedAnnotations = annotations
        .map((a) => ({
          ...a,
          x: Math.round(a.x - cropX),
          y: Math.round(a.y - cropY),
          ...(a.targetArea
            ? {
                targetArea: {
                  ...a.targetArea,
                  x: Math.round(a.targetArea.x - cropX),
                  y: Math.round(a.targetArea.y - cropY)
                }
              }
            : {})
        }))
        .filter((a) => a.x >= -60 && a.x <= cropW + 60 && a.y >= -60 && a.y <= cropH + 60);

      setImageDimensions({ width: offscreenCanvas.width, height: offscreenCanvas.height });
      setCropSelection(null);

      const commitCrop = async () => {
        let finalPath = croppedDataUrl;
        if (typeof window !== 'undefined' && window.electronAPI?.importPastedImage) {
          try {
            finalPath = await window.electronAPI.importPastedImage(croppedDataUrl);
          } catch (err) {
            console.warn('Failed to save cropped image to assets folder:', err);
          }
        }
        if (onImageCropped) {
          onImageCropped(finalPath, adjustedAnnotations);
        }
        if (onToolUsed) {
          onToolUsed('select');
        }
      };

      commitCrop();
    };

    const handleCancelCrop = () => {
      setCropSelection(null);
      if (onToolUsed) {
        onToolUsed('select');
      }
    };

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && activeTool === 'crop') {
          handleCancelCrop();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }, [activeTool]);

    return (
      <div
        ref={containerRef}
        className={`relative inline-block select-none ${className}`}
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`
        }}
      >
        <Stage
          ref={stageRef}
          width={displayWidth}
          height={displayHeight}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageMouseDown}
          onTouchMove={handleStageMouseMove}
          onTouchEnd={handleStageMouseUp}
          className="cursor-crosshair"
          style={{
            cursor:
              activeTool === 'select'
                ? 'default'
                : activeTool === 'text'
                ? 'text'
                : 'crosshair'
          }}
        >
          {/* Layer 1: Background Screenshot Image */}
          <Layer>
            {imageElement && (
              <KonvaImage
                image={imageElement}
                name="background-image"
                x={0}
                y={0}
                width={nativeWidth}
                height={nativeHeight}
                listening={true}
              />
            )}
          </Layer>

          {/* Layer 2: Vector Annotations */}
          <Layer>
            {annotations.map((item) => {
              const isSelected = selectedId === item.id;

              // 1. Badge Annotation
              if (item.type === 'badge') {
                const radius = item.radius || 14;
                return (
                  <Group
                    key={item.id}
                    id={item.id}
                    x={item.x}
                    y={item.y}
                    draggable={activeTool === 'select'}
                    onClick={() => onSelectId(item.id)}
                    onTap={() => onSelectId(item.id)}
                    onDragEnd={(e) => {
                      updateAnnotationItem(item.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y())
                      });
                    }}
                  >
                    <Circle
                      radius={radius}
                      fill={item.fillColor || '#2563eb'}
                      stroke={item.strokeColor || '#ffffff'}
                      strokeWidth={item.strokeWidth || 2}
                      shadowColor="rgba(0,0,0,0.3)"
                      shadowBlur={5}
                      shadowOffsetY={2}
                    />
                    <KonvaText
                      text={`${item.badgeNumber || 1}`}
                      fill="#ffffff"
                      fontSize={13}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontStyle="bold"
                      align="center"
                      verticalAlign="middle"
                      width={radius * 2}
                      height={radius * 2}
                      offsetX={radius}
                      offsetY={radius}
                      listening={false}
                    />
                  </Group>
                );
              }

              // 2. Rectangle Highlight Box
              if (item.type === 'rectangle') {
                return (
                  <Rect
                    key={item.id}
                    id={item.id}
                    x={item.x}
                    y={item.y}
                    width={item.width || 120}
                    height={item.height || 60}
                    rotation={item.rotation || 0}
                    stroke={item.strokeColor || '#ef4444'}
                    strokeWidth={item.strokeWidth || 3}
                    cornerRadius={item.radius || 6}
                    fill={item.fillColor || 'transparent'}
                    strokeScaleEnabled={false}
                    draggable={activeTool === 'select'}
                    onClick={() => onSelectId(item.id)}
                    onTap={() => onSelectId(item.id)}
                    onDragEnd={(e) => {
                      updateAnnotationItem(item.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y())
                      });
                    }}
                    onTransformEnd={(e) => handleTransformEnd(item.id, e)}
                  />
                );
              }

              // 3. Arrow Pointer
              if (item.type === 'arrow') {
                const points = item.points || [0, 0, 80, 0];
                const endX = points[2];
                const endY = points[3];

                return (
                  <Group
                    key={item.id}
                    id={item.id}
                    x={item.x}
                    y={item.y}
                    draggable={activeTool === 'select'}
                    onClick={() => onSelectId(item.id)}
                    onTap={() => onSelectId(item.id)}
                    onDragEnd={(e) => {
                      updateAnnotationItem(item.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y())
                      });
                    }}
                  >
                    <KonvaArrow
                      points={points}
                      stroke={item.strokeColor || '#2563eb'}
                      fill={item.strokeColor || '#2563eb'}
                      strokeWidth={item.strokeWidth || 3}
                      pointerLength={12}
                      pointerWidth={12}
                      strokeScaleEnabled={false}
                    />

                    {/* Tail Anchor Handle for micro adjustment */}
                    {isSelected && (
                      <Circle
                        x={0}
                        y={0}
                        radius={6}
                        fill="#ffffff"
                        stroke={item.strokeColor || '#2563eb'}
                        strokeWidth={2}
                        draggable
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          const tailDx = e.target.x();
                          const tailDy = e.target.y();
                          e.target.position({ x: 0, y: 0 });
                          const newPoints = [0, 0, Math.round(endX - tailDx), Math.round(endY - tailDy)];
                          updateAnnotationItem(item.id, {
                            x: Math.round(item.x + tailDx),
                            y: Math.round(item.y + tailDy),
                            points: newPoints
                          });
                        }}
                      />
                    )}

                    {/* Head Anchor Handle for micro adjustment */}
                    {isSelected && (
                      <Circle
                        x={endX}
                        y={endY}
                        radius={6}
                        fill={item.strokeColor || '#2563eb'}
                        stroke="#ffffff"
                        strokeWidth={2}
                        draggable
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          const headX = e.target.x();
                          const headY = e.target.y();
                          e.target.position({ x: headX, y: headY });
                          const newPoints = [0, 0, Math.round(headX), Math.round(headY)];
                          updateAnnotationItem(item.id, { points: newPoints });
                        }}
                      />
                    )}
                  </Group>
                );
              }

              // 4. Blur / Redaction Box
              if (item.type === 'blur') {
                const width = item.width || 120;
                const height = item.height || 40;
                return (
                  <Group
                    key={item.id}
                    id={item.id}
                    x={item.x}
                    y={item.y}
                    width={width}
                    height={height}
                    rotation={item.rotation || 0}
                    draggable={activeTool === 'select'}
                    onClick={() => onSelectId(item.id)}
                    onTap={() => onSelectId(item.id)}
                    onDragEnd={(e) => {
                      updateAnnotationItem(item.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y())
                      });
                    }}
                    onTransformEnd={(e) => handleTransformEnd(item.id, e)}
                  >
                    <Rect
                      width={width}
                      height={height}
                      fill={item.fillColor || '#09090b'}
                      cornerRadius={item.radius || 4}
                      stroke={item.strokeColor || '#27272a'}
                      strokeWidth={item.strokeWidth || 1}
                      shadowColor="rgba(0,0,0,0.3)"
                      shadowBlur={6}
                      strokeScaleEnabled={false}
                    />
                    <KonvaText
                      x={0}
                      y={0}
                      width={width}
                      height={height}
                      text="REDACTED"
                      fill="#71717a"
                      fontSize={10}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontStyle="bold"
                      align="center"
                      verticalAlign="middle"
                      letterSpacing={1.5}
                      listening={false}
                      opacity={0.65}
                    />
                  </Group>
                );
              }

              // 5. Zoom Loupe Tool
              if (item.type === 'zoom_loupe') {
                const loupeRadius = item.radius || loupeSettings?.radius || 90;
                const targetX = item.targetArea?.x ?? item.x - 110;
                const targetY = item.targetArea?.y ?? item.y + 110;
                const zoomFactor = item.zoomFactor || loupeSettings?.zoomFactor || 2;
                const strokeColor = item.strokeColor || currentColor || '#2563eb';

                // Calculate vector from target to loupe center
                const dx = item.x - targetX;
                const dy = item.y - targetY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);

                // Stop line at edge of loupe lens
                const edgeX = distance > loupeRadius ? item.x - Math.cos(angle) * loupeRadius : item.x;
                const edgeY = distance > loupeRadius ? item.y - Math.sin(angle) * loupeRadius : item.y;

                return (
                  <Group key={item.id} id={item.id}>
                    {/* Anchor Connecting Line */}
                    <Line
                      points={[targetX, targetY, edgeX, edgeY]}
                      stroke={strokeColor}
                      strokeWidth={2}
                      dash={[4, 3]}
                    />

                    {/* Target Anchor Dot on Screenshot */}
                    <Group
                      x={targetX}
                      y={targetY}
                      draggable={activeTool === 'select'}
                      onDragEnd={(e) => {
                        updateAnnotationItem(item.id, {
                          targetArea: {
                            x: Math.round(e.target.x()),
                            y: Math.round(e.target.y()),
                            width: loupeRadius,
                            height: loupeRadius
                          }
                        });
                      }}
                    >
                      <Circle
                        radius={5}
                        fill={strokeColor}
                        stroke="#ffffff"
                        strokeWidth={2}
                        shadowColor="rgba(0,0,0,0.3)"
                        shadowBlur={4}
                      />
                      <Circle radius={10} stroke={strokeColor} strokeWidth={1} opacity={0.6} />
                    </Group>

                    {/* Magnifier Lens Group */}
                    <Group
                      x={item.x}
                      y={item.y}
                      draggable={activeTool === 'select'}
                      onClick={() => onSelectId(item.id)}
                      onTap={() => onSelectId(item.id)}
                      onDblClick={() => cycleLoupeZoom(item)}
                      onDragEnd={(e) => {
                        updateAnnotationItem(item.id, {
                          x: Math.round(e.target.x()),
                          y: Math.round(e.target.y())
                        });
                      }}
                    >
                      {/* Clipped circular magnified viewport */}
                      <Group
                        clipFunc={(ctx) => {
                          ctx.arc(0, 0, loupeRadius, 0, Math.PI * 2, false);
                        }}
                      >
                        {imageElement && (
                          <KonvaImage
                            image={imageElement}
                            x={-targetX * zoomFactor}
                            y={-targetY * zoomFactor}
                            scaleX={zoomFactor}
                            scaleY={zoomFactor}
                            listening={false}
                          />
                        )}
                      </Group>

                      {/* Lens Border & Shadow */}
                      <Circle
                        radius={loupeRadius}
                        stroke={strokeColor}
                        strokeWidth={3}
                        shadowColor="rgba(0,0,0,0.35)"
                        shadowBlur={12}
                        shadowOffsetY={4}
                      />

                      {/* Zoom factor badge on top right of lens */}
                      <Group
                        x={Math.round(loupeRadius * 0.707)}
                        y={Math.round(-loupeRadius * 0.707)}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          cycleLoupeZoom(item);
                        }}
                        onTap={(e) => {
                          e.cancelBubble = true;
                          cycleLoupeZoom(item);
                        }}
                      >
                        <Rect
                          x={-15}
                          y={-9}
                          width={30}
                          height={18}
                          rx={9}
                          fill={strokeColor}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          shadowColor="rgba(0,0,0,0.3)"
                          shadowBlur={4}
                        />
                        <KonvaText
                          x={-15}
                          y={-8}
                          width={30}
                          height={18}
                          text={`${zoomFactor}x`}
                          fill="#ffffff"
                          fontSize={10}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          fontStyle="bold"
                          align="center"
                          verticalAlign="middle"
                          listening={false}
                        />
                      </Group>

                      {/* Direct On-Canvas Rim Resize Handle when selected */}
                      {selectedId === item.id && activeTool === 'select' && (
                        <Group
                          x={Math.round(Math.cos(Math.PI / 4) * loupeRadius)}
                          y={Math.round(Math.sin(Math.PI / 4) * loupeRadius)}
                          draggable
                          onDragEnd={(e) => {
                            const curX = e.target.x();
                            const curY = e.target.y();
                            const dist = Math.sqrt(curX * curX + curY * curY);
                            const clampedRadius = Math.min(220, Math.max(45, Math.round(dist)));
                            updateAnnotationItem(item.id, { radius: clampedRadius });
                            e.target.x(Math.round(Math.cos(Math.PI / 4) * clampedRadius));
                            e.target.y(Math.round(Math.sin(Math.PI / 4) * clampedRadius));
                          }}
                        >
                          <Circle
                            radius={8}
                            fill="#ffffff"
                            stroke={strokeColor}
                            strokeWidth={2.5}
                            shadowColor="rgba(0,0,0,0.35)"
                            shadowBlur={5}
                            shadowOffsetY={1}
                          />
                          <Circle radius={3} fill={strokeColor} />
                        </Group>
                      )}
                    </Group>
                  </Group>
                );
              }

              // 6. Text Callout Tool
              if (item.type === 'text') {
                const textContent = item.text || 'Label';
                const fontSize = item.fontSize || textSettings?.fontSize || 22;
                const isBold = item.fontWeight === 'bold' || (item.fontWeight === undefined && textSettings?.bold !== false);
                const isItalic = item.fontStyle === 'italic' || (item.fontStyle === undefined && textSettings?.italic === true);
                const fontStyleStr = isBold && isItalic ? 'italic bold' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';
                const hasBg = item.hasBackground !== false;

                const charWidth = fontSize * 0.62;
                const paddingX = Math.round(fontSize * 0.65);
                const paddingY = Math.round(fontSize * 0.35);
                const textWidth = Math.max(50, textContent.length * charWidth);
                const pillWidth = Math.round(textWidth + paddingX * 2);
                const pillHeight = Math.round(fontSize + paddingY * 2);

                return (
                  <Group
                    key={item.id}
                    id={item.id}
                    x={item.x}
                    y={item.y}
                    draggable={activeTool === 'select'}
                    onClick={() => onSelectId(item.id)}
                    onTap={() => onSelectId(item.id)}
                    onDblClick={() => handleTextDblClick(item)}
                    onDragEnd={(e) => {
                      updateAnnotationItem(item.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y())
                      });
                    }}
                  >
                    {hasBg ? (
                      <>
                        <Rect
                          width={pillWidth}
                          height={pillHeight}
                          cornerRadius={Math.max(4, Math.round(fontSize * 0.25))}
                          fill={item.fillColor || currentColor || '#18181b'}
                          stroke={item.strokeColor || '#ffffff'}
                          strokeWidth={1.5}
                          shadowColor="rgba(0,0,0,0.25)"
                          shadowBlur={6}
                          shadowOffsetY={2}
                        />
                        <KonvaText
                          x={paddingX}
                          y={paddingY}
                          text={textContent}
                          fill="#ffffff"
                          fontSize={fontSize}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          fontStyle={fontStyleStr}
                          listening={false}
                        />
                      </>
                    ) : (
                      <KonvaText
                        x={0}
                        y={0}
                        text={textContent}
                        fill={item.fillColor || currentColor || '#ffffff'}
                        fontSize={fontSize}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontStyle={fontStyleStr}
                        shadowColor="rgba(0,0,0,0.85)"
                        shadowBlur={6}
                        shadowOffsetY={2}
                        listening={false}
                      />
                    )}
                  </Group>
                );
              }

              return null;
            })}

            {/* Drawing Preview for Drag-to-Create Tools */}
            {drawing.isDrawing && activeTool === 'rectangle' && (
              <Rect
                x={Math.min(drawing.startX, drawing.currentX)}
                y={Math.min(drawing.startY, drawing.currentY)}
                width={Math.abs(drawing.currentX - drawing.startX)}
                height={Math.abs(drawing.currentY - drawing.startY)}
                stroke={currentColor}
                strokeWidth={currentStrokeWidth}
                cornerRadius={6}
                dash={[4, 4]}
              />
            )}

            {drawing.isDrawing && activeTool === 'blur' && (
              <Rect
                x={Math.min(drawing.startX, drawing.currentX)}
                y={Math.min(drawing.startY, drawing.currentY)}
                width={Math.abs(drawing.currentX - drawing.startX)}
                height={Math.abs(drawing.currentY - drawing.startY)}
                fill="#09090b"
                opacity={0.8}
                stroke="#27272a"
                strokeWidth={1}
                cornerRadius={4}
              />
            )}

            {drawing.isDrawing && activeTool === 'arrow' && (
              <KonvaArrow
                points={[
                  drawing.startX,
                  drawing.startY,
                  drawing.currentX,
                  drawing.currentY
                ]}
                stroke={currentColor}
                fill={currentColor}
                strokeWidth={Math.max(3, currentStrokeWidth)}
                pointerLength={12}
                pointerWidth={12}
              />
            )}

            {/* Crop tool active drag preview */}
            {drawing.isDrawing && activeTool === 'crop' && (
              <Rect
                x={Math.min(drawing.startX, drawing.currentX)}
                y={Math.min(drawing.startY, drawing.currentY)}
                width={Math.abs(drawing.currentX - drawing.startX)}
                height={Math.abs(drawing.currentY - drawing.startY)}
                stroke="#38bdf8"
                strokeWidth={2}
                dash={[6, 4]}
                fill="rgba(56, 189, 248, 0.15)"
              />
            )}

            {/* Crop tool committed selection preview with dark outer mask */}
            {activeTool === 'crop' && cropSelection && (
              <Group listening={false}>
                {/* Top mask */}
                <Rect
                  x={0}
                  y={0}
                  width={nativeWidth}
                  height={cropSelection.y}
                  fill="#000000"
                  opacity={0.65}
                />
                {/* Bottom mask */}
                <Rect
                  x={0}
                  y={cropSelection.y + cropSelection.height}
                  width={nativeWidth}
                  height={Math.max(0, nativeHeight - (cropSelection.y + cropSelection.height))}
                  fill="#000000"
                  opacity={0.65}
                />
                {/* Left mask */}
                <Rect
                  x={0}
                  y={cropSelection.y}
                  width={cropSelection.x}
                  height={cropSelection.height}
                  fill="#000000"
                  opacity={0.65}
                />
                {/* Right mask */}
                <Rect
                  x={cropSelection.x + cropSelection.width}
                  y={cropSelection.y}
                  width={Math.max(0, nativeWidth - (cropSelection.x + cropSelection.width))}
                  height={cropSelection.height}
                  fill="#000000"
                  opacity={0.65}
                />

                {/* Crop boundary */}
                <Rect
                  x={cropSelection.x}
                  y={cropSelection.y}
                  width={cropSelection.width}
                  height={cropSelection.height}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dash={[6, 4]}
                />

                {/* Corner markers */}
                <Rect x={cropSelection.x - 4} y={cropSelection.y - 4} width={8} height={8} fill="#ffffff" stroke="#0284c7" strokeWidth={1.5} />
                <Rect x={cropSelection.x + cropSelection.width - 4} y={cropSelection.y - 4} width={8} height={8} fill="#ffffff" stroke="#0284c7" strokeWidth={1.5} />
                <Rect x={cropSelection.x - 4} y={cropSelection.y + cropSelection.height - 4} width={8} height={8} fill="#ffffff" stroke="#0284c7" strokeWidth={1.5} />
                <Rect x={cropSelection.x + cropSelection.width - 4} y={cropSelection.y + cropSelection.height - 4} width={8} height={8} fill="#ffffff" stroke="#0284c7" strokeWidth={1.5} />
              </Group>
            )}

            {/* Konva Transformer for resizing and rotating */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              anchorFill="#ffffff"
              anchorStroke="#2563eb"
              anchorCornerRadius={2}
              anchorSize={8}
              borderStroke="#2563eb"
              borderDash={[3, 3]}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 15 || newBox.height < 15) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>

        {/* Crop tool Floating Action Pill */}
        {activeTool === 'crop' && cropSelection && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 px-4 py-2 rounded-full shadow-2xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95">
            <span className="text-xs font-mono text-zinc-300 font-medium">
              {cropSelection.width} × {cropSelection.height} px
            </span>
            <div className="w-[1px] h-3.5 bg-zinc-700 mx-0.5" />
            <button
              onClick={handleApplyCrop}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-full shadow-sm transition-colors cursor-pointer"
              title="Apply Crop"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Crop
            </button>
            <button
              onClick={handleCancelCrop}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-full transition-colors cursor-pointer"
              title="Cancel (Esc)"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Crop tool Helper Banner when no crop area is selected yet */}
        {activeTool === 'crop' && !cropSelection && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-zinc-700/60 px-4 py-1.5 rounded-full shadow-lg backdrop-blur-sm text-xs text-zinc-300 flex items-center gap-2 z-40 pointer-events-none select-none">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Click & drag on the screenshot to select crop area • <kbd className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">Esc</kbd> to cancel</span>
          </div>
        )}

        {/* Inline Text Editor Overlay */}
        {editingTextId && editingItem && (
          <div
            style={{
              position: 'absolute',
              left: `${editingItem.x * scale}px`,
              top: `${editingItem.y * scale}px`,
              zIndex: 40
            }}
          >
            <input
              autoFocus
              type="text"
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              onBlur={finishTextEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishTextEditing();
                if (e.key === 'Escape') setEditingTextId(null);
              }}
              style={{
                fontSize: `${Math.max(12, Math.round((editingItem.fontSize || 22) * scale))}px`,
                fontWeight: editingItem.fontWeight === 'bold' ? 'bold' : 'normal',
                fontStyle: editingItem.fontStyle === 'italic' ? 'italic' : 'normal',
                backgroundColor: editingItem.hasBackground !== false ? (editingItem.fillColor || currentColor) : '#18181b'
              }}
              className="px-2.5 py-1 rounded text-white border-2 border-blue-500 shadow-2xl outline-none min-w-[120px]"
            />
          </div>
        )}
      </div>
    );
  }
);

KonvaCanvas.displayName = 'KonvaCanvas';
