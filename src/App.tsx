import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  UserProfile,
  ClaimItem,
  DashboardStats,
  MasterDataResponse,
  ClaimStatusNotification,
} from './types';
import { GasService, GasCache, isGasEnvironment } from './services/gasBridge';
import { DEFAULT_MASTER_DATA } from './data/defaultMasterData';
import { HeaderProfile } from './components/HeaderProfile';
import { NotificationCenter } from './components/NotificationCenter';
import { NotificationToast } from './components/NotificationToast';
import {
  detectStatusChanges,
  getSavedNotifications,
  saveNotifications,
} from './utils/notificationHelper';
import { PipelineFilter } from './components/PipelineFilter';
import { ClaimCard } from './components/ClaimCard';
import { ClaimDetailModal } from './components/ClaimDetailModal';
import { ClaimWizard } from './components/ClaimWizard';
import { AuthModal } from './components/AuthModal';
import { ClaimReceiptModal } from './components/ClaimReceiptModal';
import { InstallPrompt } from './components/InstallPrompt';
import {
  calculateDashboardStats,
} from './utils/initialClaims';
import {
  mergeClaimsWithLocalDrafts,
  getLocalDrafts,
  recordMutationLock,
  deleteLocalDraft,
  recordDeletedClaim,
  isLocalDraftIdentifier,
  getActiveWizardSession,
  saveActiveWizardSession,
  hydrateLocalDraftsFromIdb,
} from './utils/draftStorage';
import {
  Plus,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  AlertTriangle,
  AlertCircle,
  FolderOpen,
  X,
  ExternalLink,
  LogOut,
  Loader2,
  WifiOff,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

const STORAGE_SESSION_AUTH = 'mdc_mobile_session_auth';
const STORAGE_VIEW_MODE = 'mdc_mobile_view_mode';
const STORAGE_MASTER_DATA = 'mdc_master_data_cache';
const ZOMBIE_CLEANUP_FLAG = 'mdc_zombie_cleanup_v2';

export const App: React.FC = () => {
  const isFetchingClaimsRef = useRef<boolean>(false);
  const lastClaimsFetchAtRef = useRef<number>(0);

  // Instant Session Hydration (0ms): Baca profil user langsung dari localStorage agar halaman utama langsung terbuka tanpa layar tunggu
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_SESSION_AUTH) ||
        sessionStorage.getItem(STORAGE_SESSION_AUTH);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.user.email && parsed.user.kodeAhm) {
          return parsed.user as UserProfile;
        }
      }
    } catch (_) {}
    return null;
  });

  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() => {
    // Bersihkan cache lama klaim tanpa pernah menghapus mdc_local_drafts_ milik user
    try {
      const hasCleanedZombie = localStorage.getItem(ZOMBIE_CLEANUP_FLAG);
      localStorage.removeItem('mdc_mobile_session_user');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('mdc_claims_')) {
          localStorage.removeItem(key);
        }
      }
      if (!hasCleanedZombie) {
        // Catat juga ID klaim zombie lama ke daftar tombstone agar tidak pernah hidup lagi
        recordDeletedClaim('CLM-01099-1790670340984', '77777777777');
        recordDeletedClaim('CLM-1790668898204', '12345678900');
        recordDeletedClaim('CLM-01099-1790668913846', '12345678900');
        localStorage.setItem(ZOMBIE_CLEANUP_FLAG, 'true');
      }

      const raw =
        localStorage.getItem(STORAGE_SESSION_AUTH) ||
        sessionStorage.getItem(STORAGE_SESSION_AUTH);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      // Jika objek user sudah ter-hydrate di memori (0ms), tidak perlu memblokir UI dengan splash screen verifikasi
      if (parsed && parsed.user && parsed.user.email && parsed.user.kodeAhm) {
        return false;
      }
      return Boolean(parsed && parsed.email && parsed.kodeAhm);
    } catch (_) {
      return false;
    }
  });
  const [sessionVerifyError, setSessionVerifyError] = useState<string | null>(null);

  // Master Data & Claims State: Gunakan SWR (Stale-While-Revalidate) Cache Lokal untuk Master Data (0ms)
  const [masterData, setMasterData] = useState<MasterDataResponse>(() => {
    const cached = GasCache.getMasterData();
    if (cached && Array.isArray(cached.motorList) && cached.motorList.length > 0) {
      return cached;
    }
    return DEFAULT_MASTER_DATA;
  });

  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    draft: 0,
    kirimMD: 0,
    prosesMD: 0,
    kirimDealer: 0,
    selesai: 0,
    alertDraft: false,
  });

  // View & UI Filters & Modal States
  const [activeFilter, setActiveFilter] = useState<string>(() => {
    return sessionStorage.getItem('mdc_active_filter') || 'ALL';
  });
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [viewMode, setViewMode] = useState<'CARDS' | 'SIMPLE'>(() => {
    return (localStorage.getItem(STORAGE_VIEW_MODE) as 'CARDS' | 'SIMPLE') || 'CARDS';
  });
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  
  // Status konektivitas online/offline & performa responsif aset statis
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // Notifikasi perubahan status klaim dari Google Spreadsheet
  const [notifications, setNotifications] = useState<ClaimStatusNotification[]>(() => {
    return getSavedNotifications();
  });
  const [activeToast, setActiveToast] = useState<ClaimStatusNotification | null>(null);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const handleSelectNotification = useCallback((idKlaim: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.idKlaim === idKlaim ? { ...n, read: true } : n));
      saveNotifications(updated);
      return updated;
    });

    const targetClaim = claims.find((c) => c.idKlaim === idKlaim);
    if (targetClaim) {
      setSelectedClaimForDetail(targetClaim);
    } else if (user) {
      GasService.getRecentClaims(user.kodeAhm).then((res) => {
        if (res && Array.isArray(res.data)) {
          setClaims(res.data);
          const found = res.data.find((c: ClaimItem) => c.idKlaim === idKlaim);
          if (found) setSelectedClaimForDetail(found);
        }
      });
    }
  }, [claims, user]);

  const handleMarkAllNotificationsAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  // Memulihkan status formulir wizard dari sessionStorage agar tidak mereset saat keluar aplikasi
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(() => {
    return sessionStorage.getItem('mdc_is_wizard_open') === 'true';
  });

  // Sinkronisasi otomatis ke sessionStorage
  useEffect(() => {
    sessionStorage.setItem('mdc_is_wizard_open', String(isWizardOpen));
  }, [isWizardOpen]);

  useEffect(() => {
    sessionStorage.setItem('mdc_active_filter', activeFilter);
  }, [activeFilter]);

  // Modals & Navigation Views (pulihkan draft yang sedang diedit jika halaman di-refresh)
  const [draftToContinue, setDraftToContinue] = useState<ClaimItem | null>(() => {
    return getActiveWizardSession(user?.kodeAhm);
  });

  // Sinkronisasi cadangan draft dari IndexedDB jika localStorage kosong
  useEffect(() => {
    if (!user?.kodeAhm) return;
    hydrateLocalDraftsFromIdb(user.kodeAhm).then((restored) => {
      if (restored && restored.length > 0) {
        setClaims((prev) => {
          const merged = mergeClaimsWithLocalDrafts(prev, user.kodeAhm);
          setDashboardStats(calculateDashboardStats(merged));
          return merged;
        });
      }
    });
  }, [user?.kodeAhm]);
  const [selectedClaimForDetail, setSelectedClaimForDetail] = useState<ClaimItem | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [submittedReceiptClaim, setSubmittedReceiptClaim] = useState<ClaimItem | null>(null);

  // State untuk Direct Link Publik Resi (Bisa dibuka siapa saja tanpa perlu login/instal app)
  const [publicReceiptClaim, setPublicReceiptClaim] = useState<ClaimItem | null>(null);
  const [isLoadingPublicReceipt, setIsLoadingPublicReceipt] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get('receipt'));
    }
    return false;
  });
  const [publicReceiptError, setPublicReceiptError] = useState<string | null>(null);

  // Deteksi URL Parameter ?receipt=... saat halaman dimuat
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const receiptId = params.get('receipt');

    if (receiptId) {
      setIsLoadingPublicReceipt(true);
      setPublicReceiptError(null);

      GasService.getClaimById(receiptId)
        .then((res) => {
          if (res && res.success && res.data) {
            setPublicReceiptClaim(res.data);
          } else {
            setPublicReceiptError(res?.message || `Klaim dengan ID #${receiptId} tidak ditemukan.`);
          }
        })
        .catch((err: any) => {
          setPublicReceiptError(err?.message || 'Gagal memuat detail resi klaim.');
        })
        .finally(() => {
          setIsLoadingPublicReceipt(false);
        });
    }
  }, []);

  // Monitor status koneksi & lakukan precache strategi aset kritis (logo MDC, Google Fonts, PWA icons)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Precache strategi proaktif untuk font Google Inter & Logo MDC agar loading instan di jaringan lambat
    if (typeof window !== 'undefined' && 'caches' in window) {
      const precacheCriticalAssets = async () => {
        try {
          const staticCache = await caches.open('mdc-static-assets-v3');
          const fontCache = await caches.open('mdc-fonts-v3');

          // 1. Precache Logo MDC & PWA Icons
          const logoAssets = [
            '/icon-192.png',
            '/icon-512.png',
            '/apple-touch-icon.png',
            '/manifest.webmanifest',
            'https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1',
          ];

          await Promise.allSettled(
            logoAssets.map(async (url) => {
              try {
                const matched = await staticCache.match(url);
                if (!matched) {
                  const res = await fetch(url, {
                    mode: url.startsWith('http') ? 'no-cors' : 'same-origin',
                  });
                  if (res) await staticCache.put(url, res);
                }
              } catch (_) {}
            })
          );

          // 2. Precache Fonts (Inter CSS & .woff2 glyphs)
          const fontUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap';
          try {
            const fontCssMatched = await fontCache.match(fontUrl);
            let cssText = '';
            if (!fontCssMatched) {
              const fontRes = await fetch(fontUrl);
              if (fontRes.ok) {
                cssText = await fontRes.clone().text();
                await fontCache.put(fontUrl, fontRes);
              }
            } else {
              cssText = await fontCssMatched.text();
            }

            if (cssText) {
              const fontUrls = Array.from(new Set(cssText.match(/https:\/\/fonts\.gstatic\.com\/[^\)]+/g) || [])).slice(0, 5);
              await Promise.allSettled(
                fontUrls.map(async (fUrl) => {
                  try {
                    const fMatched = await fontCache.match(fUrl);
                    if (!fMatched) {
                      const fRes = await fetch(fUrl);
                      if (fRes.ok) await fontCache.put(fUrl, fRes);
                    }
                  } catch (_) {}
                })
              );
            }
          } catch (_) {}
        } catch (_) {}
      };

      precacheCriticalAssets();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch Master Data & User Claims secara optimal dengan strategi Decoupled Split-Stream & SWR
  // 1. Klaim Terbaru (getRecentClaims) langsung diselesaikan tanpa menunggu Master Data (~200-600ms)
  // 2. Master Data (motor, part, kerusakan) berjalan independen di jalur paralel & cache lokal 0ms
  const fetchAllData = useCallback(async (currentUser: UserProfile, forceRefreshMaster = false) => {
    isFetchingClaimsRef.current = true;
    lastClaimsFetchAtRef.current = Date.now();
    setIsLoadingData(true);
    setDataFetchError(null);

    // Langkah A: Gunakan SWR Cache Master Data segera (0 milidetik UI ready)
    const localMaster = GasCache.getMasterData() || DEFAULT_MASTER_DATA;
    if (localMaster && Array.isArray(localMaster.motorList) && localMaster.motorList.length > 0) {
      setMasterData(localMaster);
    }

    // Langkah B (Non-Blocking Master Stream): Jalankan pengambilan Master Data secara independen tanpa menahan daftar klaim!
    const shouldFetchMaster = forceRefreshMaster || !localMaster || !localMaster.motorList || localMaster.motorList.length === 0;
    if (shouldFetchMaster) {
      GasService.getMasterDataKlaim(forceRefreshMaster)
        .then((freshMaster) => {
          if (freshMaster && freshMaster.success && Array.isArray(freshMaster.motorList) && freshMaster.motorList.length > 0) {
            setMasterData(freshMaster);
          }
        })
        .catch(() => {});
    } else {
      // Background revalidation tanpa memblokir UI
      setTimeout(() => {
        GasService.getMasterDataKlaim(false)
          .then((bgMaster) => {
            if (bgMaster && bgMaster.success && Array.isArray(bgMaster.motorList) && bgMaster.motorList.length > 0) {
              setMasterData(bgMaster);
            }
          })
          .catch(() => {});
      }, 600);
    }

    // Langkah C (Fast Claims Stream): Selesaikan sinkronisasi riwayat klaim seketika begitu respon tiba
    try {
      const claimsRes = await GasService.getRecentClaims(currentUser.kodeAhm);

      if (claimsRes && Array.isArray(claimsRes.data)) {
        const combined = mergeClaimsWithLocalDrafts(claimsRes.data, currentUser.kodeAhm);
        setClaims(combined);
        setDashboardStats(calculateDashboardStats(combined));

        const statusChanges = detectStatusChanges(claimsRes.data);
        if (statusChanges.length > 0) {
          setNotifications((prev) => {
            const merged = [...statusChanges, ...prev];
            saveNotifications(merged);
            return merged;
          });
          setActiveToast(statusChanges[0]);
        }
      } else {
        const localOnly = getLocalDrafts(currentUser.kodeAhm);
        setClaims(localOnly);
        setDashboardStats(calculateDashboardStats(localOnly));
      }
    } catch (err: any) {
      console.warn('[MDC] Sinkronisasi notice:', err?.message || err);
      setDataFetchError(err?.message || 'Gagal menyinkronkan data dengan spreadsheet.');
    } finally {
      lastClaimsFetchAtRef.current = Date.now();
      isFetchingClaimsRef.current = false;
      setIsLoadingData(false);
    }
  }, []);

  // Verifikasi Sesi Real-Time ke Backend Google Apps Script / Sheet Users_Mobile (Paralel di latar belakang jika sudah ter-hydrate)
  useEffect(() => {
    const verifySessionRealtime = async () => {
      let storedAuth: string | null = null;
      try {
        storedAuth =
          localStorage.getItem(STORAGE_SESSION_AUTH) ||
          sessionStorage.getItem(STORAGE_SESSION_AUTH);
      } catch (e) {
        console.warn('[MDC] Gagal membaca storage autentikasi:', e);
      }

      if (!storedAuth) {
        setIsVerifyingSession(false);
        return;
      }

      const clearStoredAuth = () => {
        try {
          localStorage.removeItem(STORAGE_SESSION_AUTH);
          sessionStorage.removeItem(STORAGE_SESSION_AUTH);
        } catch (_) {}
      };

      try {
        const parsed = JSON.parse(storedAuth);
        const { email, kodeAhm } = parsed || {};
        if (!email || !kodeAhm) {
          clearStoredAuth();
          setIsVerifyingSession(false);
          return;
        }

        // Pemanggilan verifikasi ke server backend
        const res = await GasService.loginUser(email, kodeAhm);
        if (res && res.status === 'SUCCESS' && res.user) {
          const enrichedSession = JSON.stringify({
            email: res.user.email,
            kodeAhm: res.user.kodeAhm,
            user: res.user,
          });
          localStorage.setItem(STORAGE_SESSION_AUTH, enrichedSession);
          sessionStorage.setItem(STORAGE_SESSION_AUTH, enrichedSession);
          setUser((prev) => {
            if (prev && prev.email === res.user!.email && prev.kodeAhm === res.user!.kodeAhm) {
              return prev;
            }
            return res.user!;
          });
        } else {
          // Tolak akses masuk jika akun dicabut dari Users_Mobile
          clearStoredAuth();
          setUser(null);
          setSessionVerifyError(
            res?.message ||
              'Akses Ditolak: Akun Anda tidak ditemukan pada lembar basis data Users_Mobile.'
          );
        }
      } catch (err: any) {
        console.warn('[MDC] Notice verifikasi sesi real-time:', err);
        if (!user) {
          clearStoredAuth();
          setUser(null);
          setSessionVerifyError('Gagal memverifikasi akun ke server backend. Silakan login kembali.');
        }
      } finally {
        setIsVerifyingSession(false);
      }
    };

    verifySessionRealtime();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAllData(user);
    }
  }, [user, fetchAllData]);

  // Polling data klaim berkala (setiap 60 detik) untuk mendeteksi perubahan status secara otomatis dari spreadsheet
  useEffect(() => {
    if (!user) return;

    const pollClaims = () => {
      // Jangan jalankan polling jika tab/layar sedang tidak aktif/terkunci (menghemat baterai & kuota HP)
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      // Cegah tabrakan request (race condition) jika fetchAllData sedang aktif atau baru saja selesai (< 8 detik)
      if (isFetchingClaimsRef.current || Date.now() - lastClaimsFetchAtRef.current < 8000) {
        return;
      }

      isFetchingClaimsRef.current = true;
      lastClaimsFetchAtRef.current = Date.now();

      GasService.getRecentClaims(user.kodeAhm)
        .then((claimsRes) => {
          if (claimsRes && Array.isArray(claimsRes.data)) {
            const combined = mergeClaimsWithLocalDrafts(claimsRes.data, user.kodeAhm);
            setClaims(combined);
            setDashboardStats(calculateDashboardStats(combined));

            const changes = detectStatusChanges(claimsRes.data);
            if (changes.length > 0) {
              setNotifications((prev) => {
                const merged = [...changes, ...prev];
                saveNotifications(merged);
                return merged;
              });
              setActiveToast(changes[0]);
            }
          }
        })
        .catch((err) => {
          console.warn('[MDC] Polling klaim notice:', err);
        })
        .finally(() => {
          lastClaimsFetchAtRef.current = Date.now();
          isFetchingClaimsRef.current = false;
        });
    };

    const intervalId = setInterval(pollClaims, 60000);

    // Jalankan saat pengguna kembali membuka/fokus ke aplikasi jika sudah > 30 detik sejak fetch terakhir
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden && Date.now() - lastClaimsFetchAtRef.current > 30000) {
        pollClaims();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [user]);

  // Auth Handlers (Menyimpan sesi auth beserta objek user lengkap ke localStorage agar 0ms saat aplikasi dibuka kembali)
  const handleLoginSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setSessionVerifyError(null);
    
    const sessionData = JSON.stringify({
      email: loggedInUser.email,
      kodeAhm: loggedInUser.kodeAhm,
      user: loggedInUser,
    });
    
    // Simpan ke localStorage agar tidak hilang saat aplikasi ditutup
    localStorage.setItem(STORAGE_SESSION_AUTH, sessionData);
    sessionStorage.setItem(STORAGE_SESSION_AUTH, sessionData);

    try {
      localStorage.removeItem('mdc_mobile_session_user');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mdc_claims_')) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
    setClaims([]);
    setDashboardStats(calculateDashboardStats([]));
    fetchAllData(loggedInUser);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = () => {
    setShowLogoutConfirm(false);
    setUser(null);
    
    // Hapus sesi auth dari localStorage dan sessionStorage saat tombol keluar ditekan
    localStorage.removeItem(STORAGE_SESSION_AUTH);
    sessionStorage.removeItem(STORAGE_SESSION_AUTH);
    sessionStorage.removeItem(STORAGE_MASTER_DATA);

    try {
      localStorage.removeItem('mdc_mobile_session_user');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mdc_claims_')) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
    setClaims([]);
    setDashboardStats(calculateDashboardStats([]));
  };

  const handleToggleViewMode = (mode: 'CARDS' | 'SIMPLE') => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_VIEW_MODE, mode);
  };

  // Filter & Search Engine
  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      // 1. Filter by Status
      if (activeFilter !== 'ALL') {
        if (claim.status.toLowerCase() !== activeFilter.toLowerCase()) {
          return false;
        }
      }

      // 2. Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSj = claim.noSj?.toLowerCase().includes(q);
        const matchDriver = claim.sopirPJ?.toLowerCase().includes(q);
        const matchNopol = claim.nopolPJ?.toLowerCase().includes(q);
        const matchPart = claim.items?.some(
          (item) =>
            item.namaPart?.toLowerCase().includes(q) ||
            item.tipe?.toLowerCase().includes(q) ||
            item.noMesin?.toLowerCase().includes(q) ||
            item.noRangka?.toLowerCase().includes(q)
        );
        return matchSj || matchDriver || matchNopol || matchPart;
      }

      return true;
    });
  }, [claims, activeFilter, searchQuery]);

  // Reset batas pagination saat filter atau pencarian berubah
  useEffect(() => {
    setVisibleCount(20);
  }, [activeFilter, searchQuery]);

  // Windowing daftar klaim agar render DOM di HP tetap ringan & responsif
  const visibleClaims = useMemo(() => {
    return filteredClaims.slice(0, visibleCount);
  }, [filteredClaims, visibleCount]);

  // Claim Wizard Handlers (Tombol Klaim Baru langsung aktif responsif 0ms)
  const handleOpenNewClaim = () => {
    // Jika master data belum siap, picu sinkronisasi latar belakang secara non-blocking
    if (!masterData?.success || !masterData?.motorList || masterData.motorList.length === 0) {
      GasService.getMasterDataKlaim(false)
        .then((freshMaster) => {
          if (freshMaster && freshMaster.success) {
            setMasterData(freshMaster);
          }
        })
        .catch(() => {});
    }
    if (user?.kodeAhm) {
      saveActiveWizardSession(user.kodeAhm, null);
    }
    setDraftToContinue(null);
    setIsWizardOpen(true);
  };

  const handleEditDraft = (draftClaim: ClaimItem) => {
    if (user?.kodeAhm) {
      saveActiveWizardSession(user.kodeAhm, draftClaim);
    }
    setDraftToContinue(draftClaim);
    setIsWizardOpen(true);
  };

  const handleDeleteClaim = useCallback(async (targetClaim: ClaimItem) => {
    if (!targetClaim) return;
    const kode = user?.kodeAhm || targetClaim.kodeAhm || '';
    const draftKey = targetClaim.localDraftId || targetClaim.idKlaim;
    const isLocalOnly = isLocalDraftIdentifier(draftKey) || Boolean(targetClaim.isLocalDraft);

    // 1. Hapus dari penyimpanan draft lokal (localStorage + IndexedDB)
    if (kode) {
      deleteLocalDraft(kode, draftKey);
      if (targetClaim.idKlaim && targetClaim.idKlaim !== draftKey) {
        deleteLocalDraft(kode, targetClaim.idKlaim);
      }
    }

    // 2. Perbarui state UI seketika & tutup modal detail
    setSelectedClaimForDetail(null);
    setClaims((prev) => {
      const updated = prev.filter(
        (c) =>
          (c.localDraftId || c.idKlaim) !== draftKey &&
          c.idKlaim !== targetClaim.idKlaim
      );
      setDashboardStats(calculateDashboardStats(updated));
      return updated;
    });

    // 3. Hanya panggil hapusKlaim ke backend/Spreadsheet jika klaim BUKAN local-only draft (memiliki CLM-xxx resmi)
    if (!isLocalOnly && !isLocalDraftIdentifier(targetClaim.idKlaim)) {
      recordDeletedClaim(targetClaim.idKlaim, targetClaim.noSj);
      try {
        await GasService.hapusKlaim(targetClaim.idKlaim, targetClaim.noSj, kode);
      } catch (_) {}
    }
  }, [user]);

  // Handler Tutup Resi Pengiriman & Kembali Bersih ke Halaman Utama
  const handleCloseReceipt = useCallback(() => {
    setSubmittedReceiptClaim(null);
    setIsWizardOpen(false);
    setDraftToContinue(null);
    setActiveFilter('ALL');
    setSearchQuery('');
  }, []);

  const handleSubmitSuccess = (_idKlaim: string, status: string, claimItem?: ClaimItem) => {
    if (user?.kodeAhm) {
      saveActiveWizardSession(user.kodeAhm, null);
    }
    setIsWizardOpen(false);
    setDraftToContinue(null);
    setActiveFilter('ALL');
    setSearchQuery('');

    // Confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (_) {}

    // Jika klaim disimpan sebagai Draft lokal: perbarui state langsung dari local storage tanpa request ke Spreadsheet
    if (status === 'Draft') {
      if (user?.kodeAhm) {
        setClaims((prev) => {
          const remoteOnly = prev.filter(
            (c) => c.status !== 'Draft' && !c.isLocalDraft && !isLocalDraftIdentifier(c.localDraftId || c.idKlaim)
          );
          const merged = mergeClaimsWithLocalDrafts(remoteOnly, user.kodeAhm);
          setDashboardStats(calculateDashboardStats(merged));
          return merged;
        });
      }
      return;
    }

    // Jika klaim berstatus "Dikirim ke MD", munculkan layar Resi Pengiriman Layar Penuh
    if (status === 'Dikirim ke MD' && claimItem) {
      setSubmittedReceiptClaim(claimItem);
    }

    if (claimItem) {
      recordMutationLock(claimItem);
      setClaims((prev) => {
        const filtered = prev.filter(
          (c) =>
            c.idKlaim !== claimItem.idKlaim &&
            (c.localDraftId || c.idKlaim) !== (claimItem.localDraftId || '') &&
            !(c.status === 'Draft' && c.noSj && claimItem.noSj && c.noSj === claimItem.noSj)
        );
        const updated = [claimItem, ...filtered];
        setDashboardStats(calculateDashboardStats(updated));
        return updated;
      });
    }

    if (user) {
      // Tunggu 1.5 detik agar penulisan spreadsheet selesai sebelum merefresh di latar belakang
      setTimeout(() => {
        fetchAllData(user, false);
      }, 1500);
    }
  };

  // Dealer Konfirmasi Selesai Handler (Instant 0-Wait Optimistic UI + Auto-Rollback)
  const handleConfirmFinish = async (idKlaim: string) => {
    const previousClaims = [...claims];
    const originalItem = claims.find((c) => c.idKlaim === idKlaim) || null;

    if (user) {
      let finishedItem: ClaimItem | null = null;
      const updatedClaims = claims.map((c) => {
        if (c.idKlaim === idKlaim) {
          finishedItem = {
            ...c,
            status: 'Selesai',
            tglSelesai:
              new Date().toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }) + ' (Diterima Dealer)',
          };
          return finishedItem;
        }
        return c;
      });

      if (finishedItem) {
        recordMutationLock(finishedItem);
      }

      setClaims(updatedClaims);
      setDashboardStats(calculateDashboardStats(updatedClaims));
    }

    // Langsung tutup modal & munculkan perayaan confetti tanpa tertahan latency GAS
    setSelectedClaimForDetail(null);
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.5 },
      });
    } catch (_) {}

    // Sinkronisasi ke server/GAS di latar belakang dengan proteksi Rollback otomatis
    void (async () => {
      try {
        const res = await GasService.dealerKonfirmasiSelesai(idKlaim);
        if (res && res.success) {
          if (user) {
            setTimeout(() => {
              fetchAllData(user, false);
            }, 1500);
          }
        } else {
          // Rollback jika server menolak
          if (originalItem) recordMutationLock(originalItem);
          setClaims(previousClaims);
          setDashboardStats(calculateDashboardStats(previousClaims));
          alert(res?.message || 'Gagal menyimpan konfirmasi terima ke server. Status dikembalikan.');
        }
      } catch (err: any) {
        if (originalItem) recordMutationLock(originalItem);
        setClaims(previousClaims);
        setDashboardStats(calculateDashboardStats(previousClaims));
        alert(err?.message || 'Gagal mengonfirmasi serah terima part. Status dikembalikan.');
      }
    })();
  };

  // Dealer Konfirmasi Retur Handler (Instant Optimistic UI + Auto-Rollback)
  const handleConfirmRetur = async (idKlaim: string, alasan: string) => {
    const previousClaims = [...claims];
    const originalItem = claims.find((c) => c.idKlaim === idKlaim) || null;

    if (user) {
      let returItem: ClaimItem | null = null;
      const updatedClaims = claims.map((c) => {
        if (c.idKlaim === idKlaim) {
          returItem = {
            ...c,
            status: 'Proses di MD',
            mdValidasiRepairman: `Retur Dealer: ${alasan}`,
          };
          return returItem;
        }
        return c;
      });

      if (returItem) {
        recordMutationLock(returItem);
      }

      setClaims(updatedClaims);
      setDashboardStats(calculateDashboardStats(updatedClaims));
    }

    setSelectedClaimForDetail(null);

    void (async () => {
      try {
        const res = await GasService.dealerKonfirmasiRetur(idKlaim, alasan);
        if (res && res.success) {
          if (user) {
            setTimeout(() => {
              fetchAllData(user, false);
            }, 1500);
          }
        } else {
          if (originalItem) recordMutationLock(originalItem);
          setClaims(previousClaims);
          setDashboardStats(calculateDashboardStats(previousClaims));
          alert(res?.message || 'Gagal mengirim pengajuan retur ke server. Status dikembalikan.');
        }
      } catch (err: any) {
        if (originalItem) recordMutationLock(originalItem);
        setClaims(previousClaims);
        setDashboardStats(calculateDashboardStats(previousClaims));
        alert(err?.message || 'Gagal memproses pengajuan retur klaim. Status dikembalikan.');
      }
    })();
  };

  // IF LOADING PUBLIC RECEIPT FROM DIRECT LINK (?receipt=...)
  if (isLoadingPublicReceipt) {
    return (
      <div className="h-full min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-[#f8fafc] text-slate-800 font-sans antialiased">
        <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-b from-red-600 to-red-700 p-0.5 shadow-md shadow-red-600/20 flex items-center justify-center mb-3 animate-pulse">
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-1.5 overflow-hidden">
            <img
              src="https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1"
              alt="MDC Pin"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-red-600" />
      </div>
    );
  }

  // IF PUBLIC RECEIPT OPENED DIRECTLY FROM LINK (?receipt=...)
  if (publicReceiptClaim) {
    return (
      <div className="h-full min-h-[100dvh] w-full bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <ClaimReceiptModal
          claim={publicReceiptClaim}
          user={user}
          onClose={() => {
            setPublicReceiptClaim(null);
            // Bersihkan parameter query dari URL tanpa reload halaman
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              const url = new URL(window.location.href);
              url.searchParams.delete('receipt');
              window.history.replaceState({}, document.title, url.pathname);
            }
          }}
        />
      </div>
    );
  }

  // IF PUBLIC RECEIPT ERROR (Klaim tidak ditemukan)
  if (publicReceiptError) {
    return (
      <div className="h-full min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-[#f8fafc] text-slate-800 font-sans text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">Resi Tidak Ditemukan</h3>
        <p className="text-xs text-slate-600 max-w-xs mb-4">{publicReceiptError}</p>
        <button
          type="button"
          onClick={() => {
            setPublicReceiptError(null);
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              const url = new URL(window.location.href);
              url.searchParams.delete('receipt');
              window.history.replaceState({}, document.title, url.pathname);
            }
          }}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-xs font-bold text-white transition-all cursor-pointer shadow-md shadow-red-600/20"
        >
          Tutup & Kembali
        </button>
      </div>
    );
  }

  // IF VERIFYING SESSION ON APP LOAD: TAMPILKAN ANIMASI VISUAL TANPA TEKS
  if (isVerifyingSession) {
    return (
      <div className="h-full min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-[#f8fafc] text-slate-800 font-sans antialiased">
        <div className="mdc-flash-card relative p-6 rounded-3xl bg-white border border-slate-200 shadow-xl flex flex-col items-center justify-center">
          <div className="relative mx-auto w-14 h-14 rounded-full bg-gradient-to-b from-red-600 to-red-700 p-0.5 shadow-md shadow-red-600/20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full mdc-electric-ring" />
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-1.5 overflow-hidden relative z-10">
              <img
                src="https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1"
                alt="MDC Pin"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <div className="w-24 h-[2px] mt-3.5 rounded-full mdc-laser-beam" />
        </div>
      </div>
    );
  }

  // IF NOT AUTHENTICATED: SHOW AUTH MODAL
  if (!user) {
    return (
      <>
        <AuthModal
          onLoginSuccess={handleLoginSuccess}
          externalErrorMessage={sessionVerifyError}
        />
        <InstallPrompt isAuthScreen={true} />
      </>
    );
  }

  // IF CLAIM WIZARD IS ACTIVE
  if (isWizardOpen) {
    return (
      <ClaimWizard
        user={user}
        masterData={masterData}
        initialDraft={draftToContinue}
        onCancel={() => {
          setIsWizardOpen(false);
          setDraftToContinue(null);
        }}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-slate-100 text-slate-900 flex justify-center selection:bg-red-500 selection:text-white overflow-hidden font-sans">
      {/* Mobile Shell Frame */}
      <div className="w-full max-w-md bg-[#f8fafc] h-full max-h-[100dvh] shadow-xl relative border-x border-slate-200 flex flex-col overflow-hidden text-slate-900">
        
        {/* ======================================================== */}
        {/* 1. TOP FIXED SECTION (HEADER MERAH + STATUS + SEARCH + TITLE) */}
        {/* Non-scrollable (flex-shrink-0) */}
        {/* ======================================================== */}
        <div className="flex-shrink-0 z-20 bg-white border-b border-slate-200/80 shadow-xs">
          {/* Header Profile Section (Header Berwarna Merah) */}
          <HeaderProfile
            user={user}
            onLogout={handleLogout}
            notificationSlot={
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadNotificationCount}
                onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                onSelectNotification={handleSelectNotification}
                onClearAll={handleClearAllNotifications}
              />
            }
          />

          {/* Banner Indikator Koneksi Offline / Sinyal Tidak Stabil */}
          {!isOnline && (
            <div className="mx-4 mt-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center justify-between gap-2 shadow-xs animate-pulse">
              <div className="flex items-center gap-2 min-w-0">
                <WifiOff className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span className="truncate">Koneksi tidak stabil / offline. Aset statis & data lokal tetap aktif.</span>
              </div>
              <span className="text-[9.5px] font-mono font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex-shrink-0 border border-amber-300">
                Cache Aktif
              </span>
            </div>
          )}

          {/* Backend Connection Notice if running outside GAS */}
          {!isGasEnvironment() && (
            <div className="mx-4 mt-2 p-2 rounded-xl bg-sky-50 border border-sky-200 shadow-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-sky-600 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-sky-800 leading-tight">
                <strong className="text-slate-900 block font-bold text-[11px]">Koneksi Data Siap Digunakan</strong>
                Data klaim tersimpan otomatis di perangkat & siap disinkronkan langsung ke Spreadsheet saat dibuka via Web App GAS.
              </div>
            </div>
          )}

          {/* Backend Error Banner if GAS fetch failed */}
          {isGasEnvironment() && dataFetchError && (
            <div className="mx-4 mt-2 p-2 rounded-xl bg-red-50 border border-red-200 shadow-xs flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-red-800 leading-tight">
                <strong className="text-red-900 block font-bold text-[11px]">Sinkronisasi Spreadsheet</strong>
                {dataFetchError}
              </div>
            </div>
          )}

          {/* 24-Hour Draft Alert Banner */}
          {dashboardStats.alertDraft && (
            <div className="mx-4 mt-2 p-2 rounded-xl bg-red-50 border border-red-300 shadow-xs flex items-start gap-2 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-red-800 leading-tight">
                <strong className="text-red-900 block font-bold text-[11px]">Peringatan Batas Waktu Draft!</strong>
                Terdapat klaim berstatus DRAFT titipan yang mendekati atau telah melampaui batas waktu 24 jam.
              </div>
            </div>
          )}

          {/* Pipeline Filter Status Alur Klaim */}
          <PipelineFilter
            stats={dashboardStats}
            activeFilter={activeFilter}
            onFilterChange={(st) => setActiveFilter(st)}
          />

          {/* Search Bar & View Mode Toggles */}
          <div className="px-3.5 py-1.5 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SJ, Sopir, Part, Tipe Motor..."
                className="w-full pl-7 pr-6 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all font-normal"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (user) fetchAllData(user, false);
              }}
              title="Sinkronkan Data Klaim Terbaru"
              className={`p-1.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 transition-all cursor-pointer ${
                isLoadingData ? 'animate-spin text-red-600' : ''
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <div className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => handleToggleViewMode('CARDS')}
                title="Tampilan Kartu Lengkap"
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'CARDS'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('SIMPLE')}
                title="Tampilan Ringkas"
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'SIMPLE'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Claims List Header: Judul Daftar Pengajuan Klaim */}
          <div className="relative px-3.5 py-1.5 flex items-center justify-between border-t border-slate-200/80 bg-slate-50/80 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFilter}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-[10.5px] font-bold text-slate-800 uppercase tracking-wide">
                  {activeFilter === 'ALL' ? 'Daftar Pengajuan Klaim' : `Status: ${activeFilter}`}{' '}
                  <span className="text-red-600 font-mono font-bold">({filteredClaims.length})</span>
                </span>
              </motion.div>
            </AnimatePresence>

            {searchQuery ? (
              <span className="text-[9.5px] text-slate-500 italic">Hasil pencarian</span>
            ) : null}

            {/* Pita Kilatan Laser Horizontal saat menyinkronkan data */}
            {isLoadingData && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] mdc-laser-beam" />
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. SCROLLABLE CLAIMS LIST SECTION                        */}
        {/* Smooth, robust native scroll with zero clipping           */}
        {/* ======================================================== */}
        <div className="flex-1 min-h-0 relative w-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFilter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full"
            >
              {filteredClaims.length > 0 ? (
                <div
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 160) {
                      setVisibleCount((prev) => (prev < filteredClaims.length ? Math.min(prev + 15, filteredClaims.length) : prev));
                    }
                  }}
                  className={`h-full overflow-y-auto px-3.5 py-1.5 space-y-1.5 overscroll-contain ${isLoadingData ? 'mdc-flash-card' : ''}`}
                >
                  {visibleClaims.map((claim) => (
                    <ClaimCard
                      key={claim.idKlaim}
                      claim={claim}
                      viewMode={viewMode}
                      currentUserRole={user?.role}
                      onClick={() => setSelectedClaimForDetail(claim)}
                    />
                  ))}
                  {visibleCount < filteredClaims.length && (
                    <div className="text-center py-2">
                      <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => Math.min(prev + 20, filteredClaims.length))}
                        className="text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 px-3.5 py-1.5 rounded-full transition-all cursor-pointer border border-slate-200 shadow-xs active:scale-95"
                      >
                        Tampilkan lebih banyak ({filteredClaims.length - visibleCount} klaim lagi)
                      </button>
                    </div>
                  )}
                </div>
              ) : isLoadingData ? (
                <div className="h-full overflow-y-auto px-3.5 py-2.5 space-y-2.5 select-none">
                  {/* Deretan Kartu Shimmer Kilatan Modern */}
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      style={{ animationDelay: `${idx * 120}ms` }}
                      className="mdc-flash-card rounded-2xl p-3.5 bg-white border border-slate-200 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-3.5 w-40 rounded-md bg-slate-200/80" />
                        <div className="h-4 w-20 rounded-full bg-slate-100 border border-slate-200" />
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="h-2.5 w-32 rounded bg-slate-100" />
                        <div className="h-2.5 w-16 rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full overflow-y-auto px-3.5 py-4">
                  <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-white border border-slate-200 shadow-xs my-4">
                    <FolderOpen className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-800">Belum Ada Data Klaim</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-[240px]">
                      {activeFilter !== 'ALL'
                        ? `Tidak ada pengajuan klaim dengan status "${activeFilter}".`
                        : searchQuery
                        ? 'Tidak ada klaim yang cocok dengan kata kunci pencarian.'
                        : 'Belum ada pengajuan klaim cacat unit dari dealer Anda.'}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ======================================================== */}
        {/* 3. FIXED FOOTER BAR WITH ROUNDED BUTTON                  */}
        {/* Persistent at bottom, with rounded/circular button       */}
        {/* ======================================================== */}
        <div className="flex-shrink-0 z-30 bg-white border-t border-slate-200 px-3.5 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={handleOpenNewClaim}
            className="w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold shadow-md bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-[0.98] shadow-red-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 shadow-inner">
              <Plus className="w-3.5 h-3.5 text-white stroke-[2.5]" />
            </div>
            <span className="tracking-wide font-bold">Klaim Baru</span>
          </button>
        </div>

        {/* Fullscreen Digital Receipt Modal */}
        {submittedReceiptClaim && (
          <ClaimReceiptModal
            claim={submittedReceiptClaim}
            user={user}
            onClose={handleCloseReceipt}
          />
        )}

        {/* Detail Modal */}
        <ClaimDetailModal
          claim={selectedClaimForDetail}
          user={user}
          isOpen={!!selectedClaimForDetail}
          onClose={() => setSelectedClaimForDetail(null)}
          onEditDraft={handleEditDraft}
          onDeleteClaim={handleDeleteClaim}
          onConfirmFinish={handleConfirmFinish}
          onConfirmRetur={handleConfirmRetur}
          onPreviewPhoto={(url, title) => setPreviewPhoto({ url, title })}
        />

        {/* Fullscreen Photo Lightbox */}
        {previewPhoto && (
          <div
            onClick={() => setPreviewPhoto(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-lg w-full overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl"
            >
              <div className="flex items-center justify-between p-3 border-b border-white/10 text-white">
                <h4 className="text-xs font-bold truncate pr-4">{previewPhoto.title}</h4>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="p-1.5 rounded-full bg-white/10 text-white/80 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[80vh] overflow-hidden flex items-center justify-center bg-black/50 p-3">
                <img
                  src={previewPhoto.url}
                  referrerPolicy="no-referrer"
                  alt={previewPhoto.title}
                  className="max-h-[76vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Konfirmasi Logout Kustom */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-xs overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-800 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-3 shadow-xs">
                <LogOut className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Keluar dari Akun?
              </h3>
              <p className="text-xs text-slate-600 mb-5 leading-relaxed">
                Sesi akun MDC Mobile Anda akan diakhiri dan dialihkan kembali ke layar awal.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-xs font-semibold text-slate-700 transition-all border border-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeLogout}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-95 text-xs font-bold text-white shadow-md shadow-red-600/20 transition-all cursor-pointer"
                >
                  Ya, Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-App PWA Install Prompt for Authenticated Users */}
        <InstallPrompt isAuthScreen={false} />

        {/* Floating Real-Time Notification Toast */}
        <NotificationToast
          notification={activeToast}
          onDismiss={() => setActiveToast(null)}
          onSelectClaim={handleSelectNotification}
        />
      </div>
    </div>
  );
};

export default App;
