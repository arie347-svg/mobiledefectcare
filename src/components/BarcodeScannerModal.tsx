import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Loader2, Barcode, Upload, RefreshCw } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

declare const ZXing: any;
declare const BarcodeDetector: any;

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'photo'>('live');
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zxingReaderRef = useRef<any>(null);

  // Stop video stream & loop
  const stopLiveStream = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamActive(false);
  };

  // Start live camera stream
  const startLiveStream = async () => {
    stopLiveStream();
    setErrorMessage(null);
    setIsScanning(true);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsStreamActive(true);
        setIsScanning(false);
        startLiveScanningLoop();
      }
    } catch (err: any) {
      setIsScanning(false);
      setIsStreamActive(false);
      // Fallback: switch to photo capture if live camera stream is denied or unavailable
      setErrorMessage(
        'Kamera langsung tidak dapat diakses (izin ditolak atau tidak didukung). Silakan gunakan mode Ambil Foto Barcode.'
      );
      setActiveTab('photo');
    }
  };

  // Live scan loop using BarcodeDetector or ZXing
  const startLiveScanningLoop = () => {
    let nativeDetector: any = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const formats = ['code_128', 'code_39', 'code_93', 'ean_13', 'qr_code', 'data_matrix'];
        nativeDetector = new (window as any).BarcodeDetector({ formats });
      } catch (_) {}
    }

    let zxingReader: any = null;
    if (!nativeDetector && typeof ZXing !== 'undefined') {
      try {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        zxingReader = new ZXing.BrowserMultiFormatReader(hints);
        zxingReaderRef.current = zxingReader;
      } catch (_) {}
    }

    let lastScanTime = 0;
    const scanInterval = 250; // Scan every 250ms

    const tick = async (timestamp: number) => {
      if (!videoRef.current || !streamRef.current) return;

      if (timestamp - lastScanTime > scanInterval) {
        lastScanTime = timestamp;
        const video = videoRef.current;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          try {
            // 1. Try Native BarcodeDetector (fastest)
            if (nativeDetector) {
              const barcodes = await nativeDetector.detect(video);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                const detectedCode = barcodes[0].rawValue.trim().toUpperCase();
                stopLiveStream();
                onDetected(detectedCode);
                onClose();
                return;
              }
            } else if (zxingReader) {
              // 2. Try ZXing from video frame
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(video.videoWidth, 800);
              canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                try {
                  const result = await zxingReader.decodeFromCanvas(canvas);
                  const txt = result.getText ? result.getText() : result.text;
                  if (txt) {
                    const detectedCode = txt.trim().toUpperCase();
                    stopLiveStream();
                    onDetected(detectedCode);
                    onClose();
                    return;
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  };

  // Switch tabs
  const handleTabChange = (tab: 'live' | 'photo') => {
    setActiveTab(tab);
    setErrorMessage(null);
    if (tab === 'live') {
      startLiveStream();
    } else {
      stopLiveStream();
    }
  };

  // Photo decode handler (alternative mode)
  const decodeImageFile = async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
              try {
                const supportedFormats = await (window as any).BarcodeDetector.getSupportedFormats();
                const formats = ['code_128', 'code_39', 'code_93', 'ean_13', 'qr_code', 'data_matrix'].filter(
                  (f) => supportedFormats.includes(f)
                );
                const detector = new (window as any).BarcodeDetector({ formats });
                const bitmap = await createImageBitmap(file);
                const barcodes = await detector.detect(bitmap);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  return resolve(barcodes[0].rawValue);
                }
              } catch (_) {}
            }

            if (typeof ZXing !== 'undefined') {
              const hints = new Map();
              hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
              const codeReader = new ZXing.BrowserMultiFormatReader(hints);

              const maxDim = 1200;
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }

              const canvas0 = document.createElement('canvas');
              canvas0.width = w;
              canvas0.height = h;
              const ctx0 = canvas0.getContext('2d');
              if (ctx0) {
                ctx0.imageSmoothingQuality = 'high';
                ctx0.drawImage(img, 0, 0, w, h);
                try {
                  const res = await codeReader.decodeFromCanvas(canvas0);
                  const txt = res.getText ? res.getText() : res.text;
                  if (txt) return resolve(txt);
                } catch (_) {}

                // Try 90 degree rotate
                const canvas90 = document.createElement('canvas');
                canvas90.width = h;
                canvas90.height = w;
                const ctx90 = canvas90.getContext('2d');
                if (ctx90) {
                  ctx90.translate(h / 2, w / 2);
                  ctx90.rotate((90 * Math.PI) / 180);
                  ctx90.drawImage(img, -w / 2, -h / 2, w, h);
                  try {
                    const res90 = await codeReader.decodeFromCanvas(canvas90);
                    const txt90 = res90.getText ? res90.getText() : res90.text;
                    if (txt90) return resolve(txt90);
                  } catch (_) {}
                }
              }
            }

            resolve(null);
          } catch (_) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleFileCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setErrorMessage(null);

    try {
      const code = await decodeImageFile(file);
      if (code) {
        stopLiveStream();
        onDetected(code.trim().toUpperCase());
        onClose();
      } else {
        setErrorMessage(
          'Garis barcode tidak terdeteksi dari foto. Pastikan stiker barcode tampak jelas atau gunakan ketik manual.'
        );
      }
    } catch (_) {
      setErrorMessage('Terjadi kesalahan saat memproses gambar.');
    } finally {
      setIsScanning(false);
    }
  };

  const triggerCameraInput = () => {
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Lifecycle when open/close
  useEffect(() => {
    if (isOpen) {
      setActiveTab('live');
      startLiveStream();
    } else {
      stopLiveStream();
    }
    return () => {
      stopLiveStream();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
      {/* Hidden file input for photo mode */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileCapture}
      />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-slate-950 p-4 shadow-2xl backdrop-blur-xl text-white flex flex-col max-h-[90vh]">
        {/* Header with Title and Close Button */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white leading-tight">Pemindai Barcode Motor</h3>
              <p className="text-[10px] text-white/60">Arahkan kamera ke stiker barcode</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopLiveStream();
              onClose();
            }}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle: Live Scanner vs Ambil Foto */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/5 rounded-xl mt-3 border border-white/10">
          <button
            type="button"
            onClick={() => handleTabChange('live')}
            className={`py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'live'
                ? 'bg-red-600 text-white shadow'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Scan Langsung (Live)
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('photo')}
            className={`py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'photo'
                ? 'bg-red-600 text-white shadow'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Foto Barcode
          </button>
        </div>

        {/* Scanner Content Body */}
        <div className="my-3 flex-1 flex flex-col items-center justify-center min-h-[220px]">
          {activeTab === 'live' ? (
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black border border-white/20 flex items-center justify-center">
              {/* Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Aiming Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-4/5 h-24 border-2 border-red-500/80 rounded-xl relative shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                  {/* Scanning Laser Line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-red-400 shadow-[0_0_8px_#f87171] animate-pulse top-1/2 -translate-y-1/2" />
                  <span className="absolute -top-6 left-0 right-0 text-center text-[10px] font-mono text-red-300 font-bold tracking-wider">
                    Posisikan Barcode di Kotak
                  </span>
                </div>
              </div>

              {/* Status or Spinner */}
              {isScanning && !isStreamActive && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-2" />
                  <span className="text-xs">Menghubungkan Kamera...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full py-4 px-2 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-400 mb-2">
                <Camera className="w-6 h-6" />
              </div>
              <p className="text-xs text-white/80 font-medium">Mode Foto Barcode</p>
              <p className="text-[10px] text-white/50 max-w-[220px] mt-1 mb-4">
                Ambil foto stiker barcode secara jelas menggunakan kamera ponsel
              </p>

              {isScanning ? (
                <div className="flex flex-col items-center justify-center py-2">
                  <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-2" />
                  <span className="text-xs font-semibold text-white/90">Menganalisa garis barcode...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={triggerCameraInput}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold shadow-lg shadow-red-900/50 flex items-center justify-center gap-2 active:scale-98"
                >
                  <Camera className="w-4 h-4" /> Buka Kamera HP
                </button>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-2 w-full rounded-xl border border-red-500/40 bg-red-950/70 p-2.5 text-left">
              <p className="text-[11px] font-medium text-red-200 leading-tight">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          {activeTab === 'live' ? (
            <button
              type="button"
              onClick={startLiveStream}
              className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3 h-3" /> Refresh Kamera
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => {
              stopLiveStream();
              onClose();
            }}
            className="text-xs text-white/60 hover:text-white transition-colors font-medium ml-auto"
          >
            Tutup & Ketik Manual
          </button>
        </div>
      </div>
    </div>
  );
};
