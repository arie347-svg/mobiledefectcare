import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface ActionLoadingSplashProps {
  show: boolean;
  title: string;
  subtitle?: string;
  status?: 'LOADING' | 'SUCCESS' | 'ERROR';
  isExiting?: boolean;
  progress?: number;
}

export const ActionLoadingSplash: React.FC<ActionLoadingSplashProps> = ({
  show,
  title,
  subtitle,
  status = 'LOADING',
  isExiting = false,
  progress,
}) => {
  if (!show && !isExiting) return null;

  return (
    <div
      className={`fixed inset-0 z-[999999] bg-white flex flex-col items-center justify-center p-6 text-center select-none font-sans antialiased transition-all duration-500 ease-in-out ${
        isExiting
          ? 'opacity-0 scale-[1.015] pointer-events-none'
          : 'opacity-100 scale-100 pointer-events-auto'
      }`}
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="relative flex flex-col items-center justify-center max-w-xs mx-auto">
        {/* Logo Container with Soft Pulse Animation */}
        <div className="relative mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-red-600 via-red-500 to-amber-500 p-0.5 shadow-xl shadow-red-600/25 flex items-center justify-center animate-pulse">
          <div className="w-full h-full rounded-[22px] bg-white flex items-center justify-center p-2 overflow-hidden">
            <img
              src="/icon-192.png"
              alt="MDC Pin"
              className="w-10 h-10 object-contain"
              onError={(e) => {
                (e.target as HTMLElement).setAttribute(
                  'src',
                  'https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1'
                );
              }}
            />
          </div>

          {/* Success Check Badge */}
          {status === 'SUCCESS' && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white shadow-md animate-in zoom-in-75 duration-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Title & Subtitle */}
        <div className="mt-5 text-center px-2">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs font-medium text-slate-500 mt-1 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Laser Accent Beam or Progress on Pure White Background */}
        <div className="w-28 h-1.5 bg-slate-100 rounded-full mt-6 overflow-hidden relative border border-slate-200/50">
          {typeof progress === 'number' && status !== 'SUCCESS' ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-red-500 to-amber-500 transition-all duration-150 ease-out"
              style={{ width: `${Math.min(Math.max(progress, 8), 100)}%` }}
            />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === 'SUCCESS'
                  ? 'w-full bg-emerald-500'
                  : 'w-1/2 bg-gradient-to-r from-transparent via-red-600 to-transparent animate-[mdcLaserBeam_1.4s_ease-in-out_infinite]'
              }`}
            />
          )}
        </div>

        {/* Micro-Status Footer */}
        <div className="mt-3.5 flex items-center gap-2 text-[11px] font-medium text-slate-400">
          {status === 'SUCCESS' ? (
            <span className="text-emerald-600 font-semibold tracking-wide">
              Selesai &bull; Membuka Halaman...
            </span>
          ) : typeof progress === 'number' ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              <span className="font-mono text-slate-600 font-semibold">{progress}%</span>
              <span>&bull; Mohon tunggu...</span>
            </div>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              <span>Mohon tunggu sebentar...</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
