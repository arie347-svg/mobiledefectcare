import React, { useEffect, useRef } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  height?: number;
  hideHint?: boolean;
  onChange?: (dataUrl: string) => void;
  onClear?: () => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  id,
  label,
  required = false,
  value,
  height = 70,
  hideHint = true,
  onChange,
  onClear,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle canvas dimensions on resize
    const setCanvasResolution = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        // Save current canvas content before resize
        const prevData = canvas.toDataURL();
        canvas.width = rect.width;
        canvas.height = height;

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (value && value.startsWith('data:image')) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          img.src = value;
        } else if (prevData && !prevData.includes('AAAA') && prevData.length > 500) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          img.src = prevData;
        }
      }
    };

    setCanvasResolution();
    window.addEventListener('resize', setCanvasResolution);

    return () => {
      window.removeEventListener('resize', setCanvasResolution);
    };
  }, [value, height]);

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    canvas.setPointerCapture(e.pointerId);

    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (onChange) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (onClear) onClear();
    if (onChange) onChange('');
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <label className="text-[11px] font-semibold text-white/90 tracking-wide">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 hover:text-amber-200 transition-colors py-0.5 px-1.5 rounded bg-white/10"
        >
          <Eraser className="w-3 h-3" />
          Hapus Paraf
        </button>
      </div>

      <div
        className="relative rounded-xl overflow-hidden border border-white/25 bg-white shadow-inner"
        style={{ height: `${height}px` }}
      >
        <canvas
          id={id}
          ref={canvasRef}
          style={{ height: `${height}px`, width: '100%' }}
          className="w-full block touch-none cursor-crosshair bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {!value && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span className="text-[10px] text-slate-300 select-none">
              Tanda tangan / paraf di sini
            </span>
          </div>
        )}
      </div>
      {!hideHint && (
        <p className="text-[9px] text-white/50 mt-0.5">
          Bubuhkan tanda tangan / paraf langsung dengan jari atau stylus.
        </p>
      )}
    </div>
  );
};
