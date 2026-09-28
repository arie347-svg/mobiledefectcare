import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[MDC ErrorBoundary] Uncaught React Error:', error, errorInfo);
  }

  private handleReset = () => {
    // Bersihkan state modal bermasalah di sessionStorage jika ada
    try {
      sessionStorage.removeItem('mdc_is_wizard_open');
    } catch (_) {}
    (this as any).setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-neutral-950 to-slate-950 text-white font-sans antialiased">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-b from-neutral-900 via-slate-900 to-red-950 p-6 shadow-2xl text-center ring-1 ring-white/10">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center mb-3 shadow-lg shadow-red-950/60">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            
            <h3 className="text-base font-bold text-white mb-1.5">
              Terjadi Kendala Tampilan
            </h3>
            
            <p className="text-xs text-white/70 mb-5 leading-relaxed">
              Sistem telah mendeteksi kendala pada antarmuka. Anda dapat kembali langsung ke halaman utama dengan aman.
            </p>

            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:brightness-110 active:scale-98 text-xs font-bold text-white shadow-md shadow-red-950/80 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>Kembali ke Halaman Utama</span>
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
