import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  CheckCircle2,
  Share,
  PlusSquare,
  X,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface InstallPromptProps {
  isAuthScreen?: boolean;
}

export type DevicePlatform = 'ios' | 'android' | 'desktop';

const detectPlatform = (): DevicePlatform => {
  if (typeof window === 'undefined') return 'desktop';
  try {
    const ua = (window.navigator?.userAgent || '').toLowerCase();
    const platform = (window.navigator?.platform || '').toLowerCase();

    // Deteksi perangkat iOS (iPhone, iPad, iPod, dan iPadOS Safari)
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (platform === 'macintel' && (window.navigator?.maxTouchPoints || 0) > 1);

    if (isIos) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
  } catch (_) {
    return 'desktop';
  }
};

export const InstallPrompt: React.FC<InstallPromptProps> = ({ isAuthScreen = false }) => {
  const [platform, setPlatform] = useState<DevicePlatform>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined' && (window as any).deferredInstallPrompt) {
      return (window as any).deferredInstallPrompt;
    }
    return null;
  });
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [installedSuccess, setInstalledSuccess] = useState<boolean>(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    // Periksa apakah aplikasi sudah berjalan dalam mode PWA Standalone (sudah terpasang di HP)
    const checkStrictStandalone = () => {
      try {
        const isStandaloneMedia =
          window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches;
        const isIosStandalone = (window.navigator as any).standalone === true;
        const isAndroidApp = document.referrer.includes('android-app://');

        return Boolean(isStandaloneMedia || isIosStandalone || isAndroidApp);
      } catch (_) {
        return false;
      }
    };

    const runningInApp = checkStrictStandalone();
    setIsStandalone(runningInApp);

    const inIframe = typeof window !== 'undefined' && window.self !== window.top;
    setIsInIframe(inIframe);

    // Jika sudah mode standalone di HP, jangan tampilkan popup instal
    if (runningInApp) {
      setShowPopup(false);
      return;
    }

    // Cek apakah pengguna telah menutup popup sesi ini
    try {
      const dismissed = sessionStorage.getItem('mdc_pwa_bottom_dismissed') === 'true';
      if (!dismissed) {
        // Beri sedikit jeda halus (800ms) agar transisi halaman tidak kaget
        const timer = setTimeout(() => {
          setShowPopup(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch (_) {}

    // Tangkap prompt yang mungkin sudah tersimpan di window
    if (typeof window !== 'undefined' && (window as any).deferredInstallPrompt) {
      setDeferredPrompt((window as any).deferredInstallPrompt);
    }

    const handlePwaReady = (e?: any) => {
      const prompt = e?.detail || (typeof window !== 'undefined' ? (window as any).deferredInstallPrompt : null);
      if (prompt) {
        setDeferredPrompt(prompt);
      }
    };

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any).deferredInstallPrompt = e;
      setDeferredPrompt(e);
      if (!checkStrictStandalone()) {
        try {
          if (sessionStorage.getItem('mdc_pwa_bottom_dismissed') !== 'true') {
            setShowPopup(true);
          }
        } catch (_) {}
      }
    };

    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') {
        (window as any).deferredInstallPrompt = null;
      }
      try {
        localStorage.setItem('mdc_pwa_installed', 'true');
      } catch (_) {}
      setTimeout(() => {
        setShowPopup(false);
      }, 2500);
    };

    const handleOpenManual = () => {
      setShowPopup(true);
    };

    window.addEventListener('pwa-prompt-ready', handlePwaReady);
    window.addEventListener('pwa-installed', handleAppInstalled);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('open-pwa-install', handleOpenManual);

    return () => {
      window.removeEventListener('pwa-prompt-ready', handlePwaReady);
      window.removeEventListener('pwa-installed', handleAppInstalled);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-pwa-install', handleOpenManual);
    };
  }, [isAuthScreen]);

  // Sembunyikan jika dalam mode PWA Standalone atau popup tidak aktif
  if (isStandalone || !showPopup) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem('mdc_pwa_bottom_dismissed', 'true');
    } catch (_) {}
    setShowPopup(false);
    setShowIosGuide(false);
  };

  const handleInstallAction = async () => {
    // 1. Jika perangkat iOS, tampilkan panduan visual Safari
    if (platform === 'ios') {
      setShowIosGuide(true);
      return;
    }

    // 2. Jika di dalam iframe (misal preview AI Studio), browser memblokir prompt native
    if (isInIframe && typeof window !== 'undefined') {
      window.open(window.location.href, '_blank');
      return;
    }

    // 3. Alur Android & Chromium Desktop Native Prompt
    setIsInstalling(true);
    let promptEvent =
      deferredPrompt ||
      (typeof window !== 'undefined' ? (window as any).deferredInstallPrompt : null);

    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setInstalledSuccess(true);
          try {
            localStorage.setItem('mdc_pwa_installed', 'true');
          } catch (_) {}
          setTimeout(() => {
            setShowPopup(false);
          }, 2000);
        }
        setDeferredPrompt(null);
        if (typeof window !== 'undefined') {
          (window as any).deferredInstallPrompt = null;
        }
      } catch (err) {
        console.warn('[PWA] Kesalahan instalasi:', err);
      } finally {
        setIsInstalling(false);
      }
      return;
    }

    setIsInstalling(false);
    // Jika event belum tertangkap browser (misal Chrome belum siap atau dibuka via link web)
    alert(
      'Untuk memasang aplikasi:\nKetuk ikon titik tiga (⋮) di kanan atas browser Chrome Anda, lalu pilih "Tambahkan ke Layar Utama" (Install app).'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 pointer-events-auto">
      {/* Backdrop tap to dismiss */}
      <div className="flex-1 w-full" onClick={handleDismiss} />

      {/* Floating Bottom Sheet Card persis seperti model PWA Google AI Studio */}
      <div className="relative w-full max-w-md mx-auto overflow-hidden rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/20 bg-gradient-to-b from-slate-900/98 via-neutral-900/98 to-red-950/98 p-4 sm:p-5 shadow-2xl text-white backdrop-blur-xl animate-in slide-in-from-bottom duration-300">
        {/* Decorative Ambient Light */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-amber-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Drag / Pull Handle Bar di Atas */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

        {installedSuccess ? (
          /* ======================================================== */
          /* KONDISI: BERHASIL DIPASANG KE PERANGKAT                  */
          /* ======================================================== */
          <div className="py-3 text-center space-y-2 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white">MDC Mobile Berhasil Dipasang</h4>
            <p className="text-xs text-white/70">
              Ikon aplikasi telah ditambahkan ke Layar Utama HP Anda.
            </p>
          </div>
        ) : showIosGuide ? (
          /* ======================================================== */
          /* PANDUAN LANGKAH CEPAT KHUSUS iOS (APPLE SAFARI)          */
          /* ======================================================== */
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-white">Pasang di iPhone / iPad</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-white/90">
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 border border-white/10">
                <div className="w-6 h-6 rounded-md bg-sky-500/20 border border-sky-400/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <Share className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] leading-tight">
                  <span>1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 border border-white/10">
                <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-400/30 flex items-center justify-center flex-shrink-0 text-amber-400">
                  <PlusSquare className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] leading-tight">
                  <span>2. Gulir menu ke bawah lalu pilih <strong>Add to Home Screen</strong>.</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 border border-white/10">
                <div className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] leading-tight">
                  <span>3. Ketuk <strong>Tambah (Add)</strong> di sudut kanan atas.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-all cursor-pointer"
            >
              Mengerti & Tutup
            </button>
          </div>
        ) : (
          /* ======================================================== */
          /* BANNER UTAMA BOTTOM SHEET PERSIS GOOGLE AI STUDIO        */
          /* ======================================================== */
          <div className="space-y-3">
            {/* Header Profil Aplikasi */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Logo App */}
                <div className="relative flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 via-red-500 to-amber-500 p-0.5 shadow-xl shadow-red-950/80">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden">
                    <img
                      src="/icon-192.png"
                      alt="Logo MDC Mobile"
                      className="w-9 h-9 object-contain drop-shadow"
                      onError={(e) => {
                        (e.target as HTMLElement).setAttribute(
                          'src',
                          'https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1'
                        );
                      }}
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-white tracking-wide truncate">
                      MDC Mobile
                    </h4>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[9px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" /> PDI Dealer
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 truncate mt-0.5">
                    Aplikasi PWA Resmi Mobile Defect Care
                  </p>
                </div>
              </div>

              {/* Tombol Silang (X) di Sudut Kanan */}
              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                title="Tutup banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Deskripsi Manfaat Singkat */}
            <p className="text-xs text-white/75 leading-relaxed">
              Pasang ke Layar Utama HP untuk akses cepat 1-ketuk, navigasi layar penuh tanpa bilah URL browser, dan performa pemindaian barcode optimal.
            </p>

            {/* Tombol Aksi: Pasang Aplikasi (Primary) & Nanti Saja (Secondary) */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDismiss}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-98 text-xs font-semibold text-white/80 hover:text-white transition-all border border-white/10 text-center cursor-pointer"
              >
                Nanti Saja
              </button>

              <button
                type="button"
                onClick={handleInstallAction}
                disabled={isInstalling}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:brightness-110 active:scale-98 text-xs font-bold text-white shadow-lg shadow-red-950 border border-red-400/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-80"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : isInIframe ? (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka & Pasang</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Pasang Aplikasi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
