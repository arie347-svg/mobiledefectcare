import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { GasService, isGasEnvironment } from '../services/gasBridge';
import { ActionLoadingSplash } from './ActionLoadingSplash';
import {
  LogIn,
  AlertCircle,
  Building2,
  Mail,
  User,
  MessageCircle,
  Search,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: (user: UserProfile) => void;
  initialTab?: 'LOGIN' | 'REGISTER';
  externalErrorMessage?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onLoginSuccess,
  initialTab = 'LOGIN',
  externalErrorMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>(initialTab);

  // Splash Screen State untuk Masuk & Daftar
  const [splashState, setSplashState] = useState<{
    show: boolean;
    title: string;
    subtitle?: string;
    status: 'LOADING' | 'SUCCESS' | 'ERROR';
    isExiting: boolean;
  }>({
    show: false,
    title: '',
    subtitle: '',
    status: 'LOADING',
    isExiting: false,
  });

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginKodeAhm, setLoginKodeAhm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(externalErrorMessage || null);

  React.useEffect(() => {
    if (externalErrorMessage) {
      setErrorMessage(externalErrorMessage);
    }
  }, [externalErrorMessage]);

  // Register form state
  const [regEmail, setRegEmail] = useState('');
  const [regNama, setRegNama] = useState('');
  const [regHp, setRegHp] = useState('');
  const [regKodeAhm, setRegKodeAhm] = useState('');
  const [regLookupLoading, setRegLookupLoading] = useState(false);
  const [lookupProgress, setLookupProgress] = useState(0);
  const [regDealerInfo, setRegDealerInfo] = useState<{
    found: boolean;
    kodeAhm?: string;
    namaDealer?: string;
    kodeDealer?: string;
    kategori?: string;
    kota?: string;
    sentraDistribusi?: string;
  } | null>(null);

  // Field inline validation states
  const [emailTouched, setEmailTouched] = useState(false);
  const [hpTouched, setHpTouched] = useState(false);

  // Helper animasi progress persentase (0 -> 100%)
  const progressIntervalRef = useRef<any>(null);

  const startProgressAnimation = () => {
    setLookupProgress(20);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setLookupProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 15) + 10;
      });
    }, 35);
  };

  const completeProgressAnimation = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setLookupProgress(100);
  };

  const resetProgressAnimation = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setLookupProgress(0);
  };

  // Helpers for validation
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidHp = (hp: string) => {
    const clean = hp.replace(/[^0-9]/g, '');
    return (clean.startsWith('08') || clean.startsWith('628')) && clean.length >= 10 && clean.length <= 13;
  };

  // Handle Lookup Kode AHM on Register (Cepat & Instan)
  const handleSearchKodeAhm = async (customCode?: string) => {
    const cleanKode = (customCode !== undefined ? customCode : regKodeAhm).trim();
    if (!cleanKode) {
      setErrorMessage('Silakan masukkan Kode AHM Dealer terlebih dahulu.');
      setRegDealerInfo(null);
      return;
    }

    setErrorMessage(null);
    setRegLookupLoading(true);
    startProgressAnimation();

    try {
      const res = await GasService.lookupKodeAhm(cleanKode);
      completeProgressAnimation();

      setTimeout(() => {
        if (res && res.found) {
          setRegDealerInfo(res);
          if (res.kodeAhm) {
            setRegKodeAhm(res.kodeAhm);
          }
        } else {
          setRegDealerInfo({ found: false });
        }
        setRegLookupLoading(false);
        resetProgressAnimation();
      }, 160);
    } catch (_) {
      completeProgressAnimation();
      setTimeout(() => {
        setRegDealerInfo({ found: false });
        setRegLookupLoading(false);
        resetProgressAnimation();
      }, 160);
    }
  };

  // Auto-search instan ketika pengguna mengetik 4 hingga 5 digit angka
  useEffect(() => {
    const trimmed = regKodeAhm.trim();
    const cleanDigits = trimmed.replace(/\D/g, '');

    if (cleanDigits.length >= 4 && cleanDigits.length <= 5 && !regDealerInfo?.found && !regLookupLoading) {
      const timer = setTimeout(() => {
        handleSearchKodeAhm(trimmed);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [regKodeAhm]);

  // Handle Login Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginEmail.trim() || !loginKodeAhm.trim()) {
      setErrorMessage('Silakan isi Email Akun dan Kode AHM Dealer.');
      return;
    }

    if (!isValidEmail(loginEmail)) {
      setErrorMessage('Format alamat email tidak valid.');
      return;
    }

    setIsLoading(true);
    setSplashState({
      show: true,
      title: 'Memverifikasi Akses Masuk...',
      subtitle: 'Memeriksa akun resmi PDI Man & dealer Honda',
      status: 'LOADING',
      isExiting: false,
    });

    try {
      const res = await GasService.loginUser(loginEmail, loginKodeAhm);

      if (res && res.status === 'SUCCESS' && res.user) {
        setSplashState((prev) => ({
          ...prev,
          status: 'SUCCESS',
          title: 'Berhasil Masuk!',
          subtitle: `Selamat datang, ${res.user?.nama || 'PDI Man'}`,
        }));
        setTimeout(() => {
          setSplashState((prev) => ({ ...prev, isExiting: true }));
          setTimeout(() => {
            onLoginSuccess(res.user);
            setIsLoading(false);
            setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
          }, 450);
        }, 350);
        return;
      } else {
        setSplashState((prev) => ({ ...prev, isExiting: true }));
        setTimeout(() => {
          setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
          setIsLoading(false);
          setErrorMessage(
            res?.message ||
              'Kombinasi Email dan Kode AHM tidak ditemukan. Pastikan akun telah terdaftar.'
          );
        }, 250);
      }
    } catch (err: any) {
      setSplashState((prev) => ({ ...prev, isExiting: true }));
      setTimeout(() => {
        setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
        setIsLoading(false);
        setErrorMessage(err?.message || 'Gagal terhubung ke server GAS.');
      }, 250);
    }
  };

  // Tambahkan useRef di dalam komponen AuthModal untuk mengunci submit ganda
  const isRegisteringRef = React.useRef(false);

  // Handle Register Submit
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Cegah double submit dari double-tap
    if (isRegisteringRef.current || isLoading) return;

    setErrorMessage(null);
    setEmailTouched(true);
    setHpTouched(true);

    if (!regEmail.trim() || !regNama.trim() || !regHp.trim() || !regKodeAhm.trim()) {
      setErrorMessage('Semua kolom formulir pendaftaran wajib diisi.');
      return;
    }

    if (!isValidEmail(regEmail)) {
      setErrorMessage('Format email belum benar (contoh : namaanda@gmail.com).');
      return;
    }

    if (!isValidHp(regHp)) {
      setErrorMessage('Format No. HP belum sesuai (contoh : 08xx / 628xx, 10-13 digit angka).');
      return;
    }

    if (!regDealerInfo) {
      setErrorMessage('Tekan tombol "Cari" pada Kode AHM untuk memverifikasi data dealer.');
      return;
    }

    if (!regDealerInfo.found) {
      setErrorMessage('Kode AHM tidak ditemukan pada basis data dealer resmi.');
      return;
    }

    isRegisteringRef.current = true;
    setIsLoading(true);
    setSplashState({
      show: true,
      title: 'Mendaftarkan Akun Dealer...',
      subtitle: 'Menyimpan profil resmi PDI Man ke basis data AHM',
      status: 'LOADING',
      isExiting: false,
    });

    try {
      const payload = {
        email: regEmail.trim().toLowerCase(),
        namaLengkap: regNama.trim().toUpperCase(),
        noHp: regHp.trim(),
        kodeAhm: regDealerInfo.kodeAhm || regKodeAhm.trim(),
        namaDealer: regDealerInfo.namaDealer || '',
        kodeDealer: regDealerInfo.kodeDealer || '',
        kategori: regDealerInfo.kategori || '',
        kota: regDealerInfo.kota || '',
        sentraDistribusi: regDealerInfo.sentraDistribusi || '',
        role: 'PDI Man',
      };

      const res = await GasService.registerUser(payload);

      if (res && res.success) {
        const loggedUser: UserProfile = res.user || {
          email: payload.email,
          nama: payload.namaLengkap,
          noHp: payload.noHp,
          kodeAhm: payload.kodeAhm,
          namaDealer: payload.namaDealer,
          kodeDealer: payload.kodeDealer,
          kategori: payload.kategori,
          kota: payload.kota,
          sentraDistribusi: payload.sentraDistribusi,
          role: payload.role || 'PDI Man',
        };

        setSplashState((prev) => ({
          ...prev,
          status: 'SUCCESS',
          title: 'Pendaftaran Berhasil!',
          subtitle: `Akun ${loggedUser.nama} resmi terdaftar`,
        }));
        setTimeout(() => {
          setSplashState((prev) => ({ ...prev, isExiting: true }));
          setTimeout(() => {
            onLoginSuccess(loggedUser);
            setIsLoading(false);
            isRegisteringRef.current = false;
            setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
          }, 450);
        }, 350);
        return;
      } else {
        setSplashState((prev) => ({ ...prev, isExiting: true }));
        setTimeout(() => {
          setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
          setIsLoading(false);
          isRegisteringRef.current = false;
          setErrorMessage(res?.message || 'Pendaftaran gagal. Silakan coba kembali.');
        }, 250);
      }
    } catch (err: any) {
      setSplashState((prev) => ({ ...prev, isExiting: true }));
      setTimeout(() => {
        setSplashState({ show: false, title: '', subtitle: '', status: 'LOADING', isExiting: false });
        setIsLoading(false);
        isRegisteringRef.current = false;
        setErrorMessage(err?.message || 'Gagal menghubungi server GAS.');
      }, 250);
    }
  };

  const isGas = isGasEnvironment();

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex justify-center selection:bg-red-500 selection:text-white font-sans antialiased text-slate-800">
      {/* Mobile Shell Frame (Full Viewport on Phone) */}
      <div className="w-full max-w-md bg-white min-h-[100dvh] flex flex-col justify-between shadow-2xl relative border-x border-slate-200/60 overflow-hidden">
        
        {/* ======================================================== */}
        {/* MAIN BODY (FULL VIEWPORT ON PHONE, CENTERED HERO)        */}
        {/* ======================================================== */}
        <div className="flex-1 px-5 py-6 overflow-y-auto flex flex-col justify-center">
          
          {/* Centered App Icon & Title */}
          <div className="text-center mb-6 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-red-600 via-red-500 to-amber-500 p-0.5 shadow-xl shadow-red-600/25 flex items-center justify-center mb-3">
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
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              MDC Mobile
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
              PDI Man Access
            </p>

            {/* Backend GAS Connection Indicator (jika standalone) */}
            {!isGas && (
              <div className="mt-3 mx-auto max-w-xs p-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-medium flex items-center justify-center gap-1.5 shadow-2xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                <span>Mode Standalone (terhubung via proxy API).</span>
              </div>
            )}
          </div>

          {/* Notifikasi Pesan Validasi / Error Global */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium flex items-center gap-2.5 shadow-2xs animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
              <span className="leading-tight flex-1">{errorMessage}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB FORMULIR VERIFIKASI / DAFTAR BARU                    */}
          {/* ======================================================== */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              
              {/* Field 1: Alamat Email Google (Gmail) * */}
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  Alamat Email Google (Gmail) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                  <Mail className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={regEmail}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="contoh: namaanda@gmail.com"
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal outline-none"
                  />
                </div>
                {emailTouched && regEmail && !isValidEmail(regEmail) && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Format email tidak valid
                  </p>
                )}
              </div>

              {/* Field 2: Nama Lengkap * */}
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                  <User className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                  <input
                    type="text"
                    required
                    value={regNama}
                    onChange={(e) => {
                      setRegNama(e.target.value.toUpperCase());
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="MASUKKAN NAMA LENGKAP"
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal uppercase outline-none tracking-wide"
                  />
                </div>
              </div>

              {/* Field 3: No. HP / WhatsApp * */}
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  No. HP / WhatsApp <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                  <MessageCircle className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    value={regHp}
                    onBlur={() => setHpTouched(true)}
                    onChange={(e) => {
                      setRegHp(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Contoh : 081234567890"
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal outline-none"
                  />
                </div>
                {hpTouched && regHp && !isValidHp(regHp) ? (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Harus format 08xx atau 628xx (10-13 digit)
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1 font-normal">
                    Format: 08xx atau 628xx (10-13 digit angka)
                  </p>
                )}
              </div>

              {/* Field 4: Kode AHM Dealer * + Tombol Cari */}
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  Kode AHM Dealer <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                    <Building2 className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={regKodeAhm}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRegKodeAhm(val);
                        if (regDealerInfo) setRegDealerInfo(null);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchKodeAhm();
                        }
                      }}
                      placeholder="Contoh : 12345"
                      className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={regLookupLoading}
                    onClick={() => handleSearchKodeAhm()}
                    className={`h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer flex-shrink-0 min-w-[82px] ${
                      regLookupLoading ? 'mdc-btn-flash-red bg-red-700' : ''
                    }`}
                  >
                    {regLookupLoading ? (
                      <span className="relative z-10 flex items-center gap-1 font-mono font-bold text-amber-200 tracking-wider">
                        <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-pulse" />
                        {lookupProgress}%
                      </span>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Cari</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Progress Bar Kilatan Modern saat Pencarian Aktif */}
                {regLookupLoading && (
                  <div className="mt-1.5 overflow-hidden rounded-full bg-slate-200 h-1.5 border border-red-500/30 p-[1px]">
                    <div
                      className="bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 h-full transition-all duration-75 ease-out rounded-full shadow-[0_0_10px_rgba(251,191,36,0.85)]"
                      style={{ width: `${lookupProgress}%` }}
                    />
                  </div>
                )}

                {/* Validasi Status di Bawah Kolom Kode AHM */}
                {regDealerInfo && regDealerInfo.found && !regLookupLoading && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-emerald-700 text-[11px] font-medium animate-in fade-in duration-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Dealer Terverifikasi (100%)</span>
                  </div>
                )}
                {regDealerInfo && !regDealerInfo.found && !regLookupLoading && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-red-600 text-[11px] font-medium animate-in fade-in duration-200">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                    <span>Dealer tidak ditemukan. Periksa kembali Kode AHM</span>
                  </div>
                )}
              </div>

              {/* Sub-Card: Kotak Informasi Dealer Terdaftar (Kompak) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    NAMA DEALER TERDAFTAR
                  </div>
                  <div className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 min-h-[32px] flex items-center overflow-hidden text-ellipsis whitespace-nowrap shadow-2xs">
                    {regDealerInfo?.namaDealer || (
                      <span className="text-slate-400 font-normal">Otomatis terisi...</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      KODE DEALER
                    </div>
                    <div className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800 min-h-[32px] flex items-center shadow-2xs">
                      {regDealerInfo?.kodeDealer || <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      KATEGORI
                    </div>
                    <div className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800 min-h-[32px] flex items-center shadow-2xs">
                      {regDealerInfo?.kategori || <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      KOTA
                    </div>
                    <div className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800 min-h-[32px] flex items-center shadow-2xs">
                      {regDealerInfo?.kota || <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      SENTRA DISTRIBUSI
                    </div>
                    <div className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800 min-h-[32px] flex items-center shadow-2xs">
                      {regDealerInfo?.sentraDistribusi || <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tombol Kirim Verifikasi Akun */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading || !regDealerInfo?.found}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-98 text-white font-bold text-sm shadow-md shadow-red-600/20 flex items-center justify-center transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>DAFTAR</span>
                </button>
              </div>

              {/* Link Sudah Punya Akun */}
              <div className="text-center pt-2">
                <p className="text-xs text-slate-500 font-medium">
                  Sudah punya akun terdaftar?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('LOGIN');
                      setErrorMessage(null);
                    }}
                    className="inline-block text-red-600 hover:text-red-700 active:scale-95 font-bold underline transition-colors cursor-pointer"
                  >
                    Masuk disini
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB MASUK AKUN (KONSISTEN RINGKAS & PAS 1 LAYAR)        */}
          {/* ======================================================== */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  Alamat Email Terdaftar <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                  <Mail className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="alamat@gmail.com"
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                  Kode AHM Dealer <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 focus-within:bg-white shadow-2xs h-11 transition-all">
                  <Building2 className="w-4 h-4 text-red-600 flex-shrink-0 mr-2.5" />
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={loginKodeAhm}
                    onChange={(e) => {
                      setLoginKodeAhm(e.target.value.trim());
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Contoh : 123 atau 00123"
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-normal outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-normal">
                  Bisa diketik dengan atau tanpa awalan angka nol
                </p>
              </div>

              {/* Tombol Masuk */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-98 text-white font-bold text-sm shadow-md shadow-red-600/20 flex items-center justify-center transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>MASUK</span>
                </button>
              </div>

              {/* Navigasi Alternatif ke Tab Daftar */}
              <div className="text-center pt-2">
                <p className="text-xs text-slate-500 font-medium">
                  Belum memiliki akun terdaftar?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('REGISTER');
                      setErrorMessage(null);
                    }}
                    className="inline-block text-red-600 hover:text-red-700 active:scale-95 font-bold underline transition-colors cursor-pointer"
                  >
                    Daftar Akun Baru
                  </button>
                </p>
              </div>
            </form>
          )}

        </div>

        {/* ======================================================== */}
        {/* 3. BOTTOM FOOTER & SECURITY BADGE (SAFE AREA BOTTOM)    */}
        {/* ======================================================== */}
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))] px-4 pt-2.5 bg-slate-50 border-t border-slate-100 flex-shrink-0 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sistem Resmi PDI Man &bull; TLS 256-bit Encrypted</span>
          </div>
        </div>

        {/* Full-Screen Pure White Action Splash Overlay */}
        <ActionLoadingSplash
          show={splashState.show}
          title={splashState.title}
          subtitle={splashState.subtitle}
          status={splashState.status}
          isExiting={splashState.isExiting}
        />

      </div>
    </div>
  );
};
