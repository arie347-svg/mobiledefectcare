import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types';
import { GasService, isGasEnvironment } from '../services/gasBridge';
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
  initialTab = 'REGISTER',
  externalErrorMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>(initialTab);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginKodeAhm, setLoginKodeAhm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginProgress, setLoginProgress] = useState(0);
  const [registerProgress, setRegisterProgress] = useState(0);
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
    setLoginProgress(15);

    // Animasi dinamis persentase login (0% -> 100%)
    const loginInterval = setInterval(() => {
      setLoginProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 8) + 10;
      });
    }, 40);

    try {
      const res = await GasService.loginUser(loginEmail, loginKodeAhm);
      clearInterval(loginInterval);

      if (res && res.status === 'SUCCESS' && res.user) {
        setLoginProgress(100);
        setTimeout(() => {
          onLoginSuccess(res.user);
          setIsLoading(false);
          setLoginProgress(0);
        }, 180);
        return;
      } else {
        setLoginProgress(0);
        setIsLoading(false);
        setErrorMessage(
          res?.message ||
            'Kombinasi Email dan Kode AHM tidak ditemukan. Pastikan akun telah terdaftar.'
        );
      }
    } catch (err: any) {
      clearInterval(loginInterval);
      setLoginProgress(0);
      setIsLoading(false);
      setErrorMessage(err?.message || 'Gagal terhubung ke server GAS.');
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
      setErrorMessage('Format email belum benar (contoh: namaanda@gmail.com).');
      return;
    }

    if (!isValidHp(regHp)) {
      setErrorMessage('Format No. HP belum sesuai (contoh: 08xx / 628xx, 10-13 digit angka).');
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
    setRegisterProgress(15);

    // Animasi dinamis persentase pendaftaran (0% -> 100%)
    const regInterval = setInterval(() => {
      setRegisterProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 8) + 10;
      });
    }, 40);

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
      clearInterval(regInterval);

      if (res && res.success) {
        setRegisterProgress(100);
        // Gunakan objek user yang langsung dikembalikan dari server pendaftaran
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

        // Langsung arahkan masuk ke aplikasi tanpa jeda kedip tombol
        setTimeout(() => {
          onLoginSuccess(loggedUser);
          setIsLoading(false);
          isRegisteringRef.current = false;
          setRegisterProgress(0);
        }, 160);
        return;
      } else {
        setRegisterProgress(0);
        setIsLoading(false);
        isRegisteringRef.current = false;
        setErrorMessage(res?.message || 'Pendaftaran gagal. Silakan coba kembali.');
      }
    } catch (err: any) {
      clearInterval(regInterval);
      setRegisterProgress(0);
      setIsLoading(false);
      isRegisteringRef.current = false;
      setErrorMessage(err?.message || 'Gagal menghubungi server GAS.');
    }
  };

  const isGas = isGasEnvironment();

  return (
    <div className="h-full min-h-[100dvh] w-full flex items-center justify-center p-3 sm:p-4 bg-gradient-to-b from-[#3a0609] via-[#220406] to-[#0d0102] overflow-y-auto font-sans antialiased text-white selection:bg-red-500 selection:text-white">
      <div className="w-full max-w-[360px] my-auto">
        
        {/* Header: Logo Pin & Judul Halaman Ramping & Ringkas */}
        <div className="text-center mb-2.5">
          <div className="mx-auto w-9 h-9 rounded-full bg-gradient-to-b from-red-500 to-red-700 p-0.5 shadow-lg shadow-red-950/80 flex items-center justify-center mb-1.5">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-1 overflow-hidden">
              <img
                src="https://lh3.googleusercontent.com/d/1fGSO4NT-xEfj0W_jeRSmfQUe1RC2_yq1"
                alt="MDC Pin"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <h1 className="text-base font-medium text-white tracking-normal leading-tight">
            {activeTab === 'REGISTER' ? 'Verifikasi Akun Dealer' : 'MDC - Dealer'}
          </h1>
          <p className="text-[11px] text-white/65 mt-0.5 font-normal">
            {activeTab === 'REGISTER'
              ? 'Pendaftaran Pengguna Resmi PDI Man'
              : 'PDI Man Access'}
          </p>
        </div>

        {/* Backend GAS Connection Indicator (jika standalone) */}
        {!isGas && (
          <div className="mb-2 p-2 rounded-xl border border-amber-500/30 bg-amber-950/40 text-amber-200 text-[10px] font-normal flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            <span>Mode Standalone (terhubung via proxy API).</span>
          </div>
        )}

        {/* Kotak Card Formulir Utama (Didesain Pas 1 Layar Penuh) */}
        <div className="relative w-full rounded-2xl border border-white/10 bg-[#281316]/80 backdrop-blur-md p-3.5 sm:p-4 shadow-xl space-y-2.5">
          
          {/* Notifikasi Pesan Validasi / Error Global */}
          {errorMessage && (
            <div className="p-2 px-2.5 rounded-xl border border-red-500/35 bg-red-950/70 text-red-200 text-[11px] font-normal flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.25)] animate-in fade-in duration-200">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
              <span className="leading-tight flex-1">{errorMessage}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB FORMULIR VERIFIKASI / DAFTAR BARU                    */}
          {/* ======================================================== */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegister} className="space-y-2.5">
              
              {/* Field 1: Alamat Email Google (Gmail) * */}
              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  Alamat Email Google (Gmail) <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-[#f0ecec] border border-white/10 px-2.5 py-1.5 focus-within:ring-1.5 focus-within:ring-red-500/50 shadow-inner h-[34px]">
                  <Mail className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="contoh: namaanda@gmail.com"
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal outline-none"
                  />
                </div>
                {emailTouched && regEmail && !isValidEmail(regEmail) && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    Format email tidak valid
                  </p>
                )}
              </div>

              {/* Field 2: Nama Lengkap * */}
              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  Nama Lengkap <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-[#f0ecec] border border-white/10 px-2.5 py-1.5 focus-within:ring-1.5 focus-within:ring-red-500/50 shadow-inner h-[34px]">
                  <User className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                  <input
                    type="text"
                    required
                    value={regNama}
                    onChange={(e) => {
                      setRegNama(e.target.value.toUpperCase());
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="MASUKKAN NAMA LENGKAP"
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal uppercase outline-none tracking-wide"
                  />
                </div>
              </div>

              {/* Field 3: No. HP / WhatsApp * */}
              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  No. HP / WhatsApp <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-[#f0ecec] border border-white/10 px-2.5 py-1.5 focus-within:ring-1.5 focus-within:ring-red-500/50 shadow-inner h-[34px]">
                  <MessageCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                  <input
                    type="tel"
                    required
                    value={regHp}
                    onBlur={() => setHpTouched(true)}
                    onChange={(e) => {
                      setRegHp(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Contoh: 081234567890"
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal outline-none"
                  />
                </div>
                {hpTouched && regHp && !isValidHp(regHp) ? (
                  <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    Harus format 08xx atau 628xx (10-13 digit)
                  </p>
                ) : (
                  <p className="text-[10px] text-white/55 mt-0.5 font-normal">
                    Format: 08xx atau 628xx (10-13 digit angka)
                  </p>
                )}
              </div>

              {/* Field 4: Kode AHM Dealer * + Tombol Cari */}
              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  Kode AHM Dealer <span className="text-red-400">*</span>
                </label>
                <div className="flex rounded-xl overflow-hidden shadow-inner border border-white/10 focus-within:ring-1.5 focus-within:ring-red-500/50 h-[34px]">
                  <div className="flex items-center flex-1 bg-[#f0ecec] px-2.5">
                    <Building2 className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                    <input
                      type="text"
                      required
                      value={regKodeAhm}
                      onChange={(e) => {
                        setRegKodeAhm(e.target.value.trim());
                        setRegDealerInfo(null);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchKodeAhm();
                        }
                      }}
                      placeholder="Contoh : 12345"
                      className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={regLookupLoading}
                    onClick={() => handleSearchKodeAhm()}
                    className={`px-3 py-1.5 bg-[#e02b37] hover:bg-[#c9202c] active:scale-95 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer flex-shrink-0 min-w-[82px] ${
                      regLookupLoading ? 'mdc-btn-flash-red bg-red-700' : ''
                    }`}
                  >
                    {regLookupLoading ? (
                      <span className="relative z-10 flex items-center gap-1 font-mono font-bold text-amber-200 tracking-wider">
                        <Zap className="w-3 h-3 text-amber-300 fill-amber-300 animate-pulse" />
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
                  <div className="mt-1.5 overflow-hidden rounded-full bg-black/40 h-1.5 border border-red-500/30 p-[1px]">
                    <div
                      className="bg-gradient-to-r from-red-500 via-amber-300 to-emerald-400 h-full transition-all duration-75 ease-out rounded-full shadow-[0_0_10px_rgba(251,191,36,0.85)]"
                      style={{ width: `${lookupProgress}%` }}
                    />
                  </div>
                )}

                {/* Validasi Status di Bawah Kolom Kode AHM */}
                {regDealerInfo && regDealerInfo.found && !regLookupLoading && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-emerald-400 text-[11px] font-normal animate-in fade-in duration-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>Dealer Terverifikasi (100%)</span>
                  </div>
                )}
                {regDealerInfo && !regDealerInfo.found && !regLookupLoading && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-red-400 text-[11px] font-normal animate-in fade-in duration-200">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span>dealer tidak ditemukan. Periksa kembali Kode AHM</span>
                  </div>
                )}
              </div>

              {/* Sub-Card: Kotak Informasi Dealer Terdaftar (Kompak) */}
              <div className="rounded-xl border border-white/10 bg-[#351a1e]/60 p-2.5 space-y-1.5">
                <div>
                  <div className="text-[9px] font-normal text-white/65 uppercase tracking-wider mb-0.5">
                    NAMA DEALER TERDAFTAR
                  </div>
                  <div className="w-full rounded-lg bg-[#452227]/70 border border-white/10 px-2 py-1 text-[11px] font-normal text-white/90 min-h-[26px] flex items-center overflow-hidden text-ellipsis whitespace-nowrap">
                    {regDealerInfo?.namaDealer || (
                      <span className="text-white/40 font-normal">Otomatis terisi...</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="text-[9px] font-normal text-white/65 uppercase tracking-wider mb-0.5">
                      KODE DEALER
                    </div>
                    <div className="w-full rounded-lg bg-[#452227]/70 border border-white/10 px-2 py-1 text-[11px] font-normal text-white/90 min-h-[26px] flex items-center">
                      {regDealerInfo?.kodeDealer || <span className="text-white/40">-</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-normal text-white/65 uppercase tracking-wider mb-0.5">
                      KATEGORI
                    </div>
                    <div className="w-full rounded-lg bg-[#452227]/70 border border-white/10 px-2 py-1 text-[11px] font-normal text-white/90 min-h-[26px] flex items-center">
                      {regDealerInfo?.kategori || <span className="text-white/40">-</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="text-[9px] font-normal text-white/65 uppercase tracking-wider mb-0.5">
                      KOTA
                    </div>
                    <div className="w-full rounded-lg bg-[#452227]/70 border border-white/10 px-2 py-1 text-[11px] font-normal text-white/90 min-h-[26px] flex items-center">
                      {regDealerInfo?.kota || <span className="text-white/40">-</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-normal text-white/65 uppercase tracking-wider mb-0.5">
                      SENTRA DISTRIBUSI
                    </div>
                    <div className="w-full rounded-lg bg-[#452227]/70 border border-white/10 px-2 py-1 text-[11px] font-normal text-white/90 min-h-[26px] flex items-center">
                      {regDealerInfo?.sentraDistribusi || <span className="text-white/40">-</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tombol Kirim Verifikasi Akun (Animasi Kilatan Modern + Dynamic Progress Fill) */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`relative overflow-hidden w-full py-2.5 px-4 rounded-xl text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-wait ${
                    isLoading
                      ? 'bg-red-900/90 mdc-btn-flash-red border border-amber-400/50'
                      : 'bg-[#c5232a] hover:bg-[#b51c23] active:scale-98 shadow-lg shadow-red-950/60'
                  }`}
                >
                  {isLoading && (
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/80 via-red-500/85 to-amber-500/60 transition-all duration-100 ease-out pointer-events-none"
                      style={{ width: `${registerProgress}%` }}
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isLoading ? (
                      <>
                        {registerProgress >= 100 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                        ) : (
                          <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                        )}
                        <span className="tracking-wide font-semibold">
                          {registerProgress >= 100 ? 'Akun Terverifikasi!' : 'Memverifikasi Akun'}
                        </span>
                        <span className="font-mono font-bold text-amber-200 tracking-wider bg-black/45 px-1.5 py-0.5 rounded-md text-[11px] border border-amber-300/40 shadow-inner">
                          {registerProgress}%
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Kirim Verifikasi Akun</span>
                      </>
                    )}
                  </div>
                </button>

                {/* Progress Bar Laser Bawah Tombol Pendaftaran */}
                {isLoading && (
                  <div className="mt-1.5 overflow-hidden rounded-full bg-black/40 h-1.5 border border-red-500/30 p-[1px]">
                    <div
                      className="bg-gradient-to-r from-red-500 via-amber-300 to-emerald-400 h-full transition-all duration-100 ease-out rounded-full shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                      style={{ width: `${registerProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Link Sudah Punya Akun */}
              <div className="text-center pt-0.5">
                <p className="text-[11px] text-white/65 font-normal">Sudah punya akun terdaftar?</p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('LOGIN');
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 active:scale-95 font-medium text-xs mt-0.5 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>Masuk di Sini</span>
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* TAB MASUK AKUN (KONSISTEN RINGKAS & PAS 1 LAYAR)        */}
          {/* ======================================================== */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  Alamat Email Terdaftar <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-[#f0ecec] border border-white/10 px-2.5 py-1.5 focus-within:ring-1.5 focus-within:ring-red-500/50 shadow-inner h-[34px]">
                  <Mail className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="nama@dealerhonda.com"
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-normal text-white/85 flex items-center gap-1 mb-1">
                  Kode AHM Dealer <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center rounded-xl bg-[#f0ecec] border border-white/10 px-2.5 py-1.5 focus-within:ring-1.5 focus-within:ring-red-500/50 shadow-inner h-[34px]">
                  <Building2 className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mr-2" />
                  <input
                    type="text"
                    required
                    value={loginKodeAhm}
                    onChange={(e) => {
                      setLoginKodeAhm(e.target.value.trim());
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Contoh: 123 atau 00123"
                    className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-500 font-normal outline-none"
                  />
                </div>
                <p className="text-[10px] text-white/50 mt-1 font-normal">
                  Bisa diketik dengan atau tanpa awalan nol
                </p>
              </div>

              {/* Tombol Masuk (Animasi Kilatan Modern + Dynamic Progress Fill) */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`relative overflow-hidden w-full py-2.5 px-4 rounded-xl text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-wait ${
                    isLoading
                      ? 'bg-red-900/90 mdc-btn-flash-red border border-amber-400/50'
                      : 'bg-[#c5232a] hover:bg-[#b51c23] active:scale-98 shadow-lg shadow-red-950/60'
                  }`}
                >
                  {isLoading && (
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/80 via-red-500/85 to-amber-500/60 transition-all duration-100 ease-out pointer-events-none"
                      style={{ width: `${loginProgress}%` }}
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isLoading ? (
                      <>
                        {loginProgress >= 100 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                        ) : (
                          <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                        )}
                        <span className="tracking-wide font-semibold">
                          {loginProgress >= 100 ? 'Akses Diterima!' : 'Memverifikasi Akun'}
                        </span>
                        <span className="font-mono font-bold text-amber-200 tracking-wider bg-black/45 px-1.5 py-0.5 rounded-md text-[11px] border border-amber-300/40 shadow-inner">
                          {loginProgress}%
                        </span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Masuk ke MDC Mobile</span>
                      </>
                    )}
                  </div>
                </button>

                {/* Progress Bar Laser Bawah Tombol Login */}
                {isLoading && (
                  <div className="mt-1.5 overflow-hidden rounded-full bg-black/40 h-1.5 border border-red-500/30 p-[1px]">
                    <div
                      className="bg-gradient-to-r from-red-500 via-amber-300 to-emerald-400 h-full transition-all duration-100 ease-out rounded-full shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                      style={{ width: `${loginProgress}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="text-center pt-1">
                <p className="text-[11px] text-white/65 font-normal">Belum memiliki akun?</p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('REGISTER');
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 active:scale-95 font-medium text-xs mt-0.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Daftar Verifikasi Akun Baru</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
