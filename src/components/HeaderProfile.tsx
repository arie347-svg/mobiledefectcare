import React from 'react';
import { UserProfile } from '../types';
import { LogOut, Building2, MapPin, Shield } from 'lucide-react';

interface HeaderProfileProps {
  user: UserProfile;
  liveTime?: string;
  onLogout: () => void;
  notificationSlot?: React.ReactNode;
}

export const HeaderProfile: React.FC<HeaderProfileProps> = ({ user, onLogout, notificationSlot }) => {
  // Informasi identitas dealer akurat
  const namaDealer = user?.namaDealer || 'Daya Adicipta Motora';
  const kodeDealer = user?.kodeDealer || 'EGKHSH';
  const rawKota = user?.kota || 'Bandung';
  const kotaFormatted = rawKota.toLowerCase().startsWith('kota') || rawKota.toLowerCase().startsWith('kab')
    ? rawKota
    : `Kota ${rawKota}`;
  const asalGudang = user?.sentraDistribusi || 'Baros';

  return (
    <div className="relative rounded-b-2xl bg-gradient-to-br from-red-600 via-red-700 to-red-900 text-white px-3.5 py-2.5 shadow-lg border-b border-white/20">
      {/* Background Decorative Pattern (Contained) */}
      <div className="absolute inset-0 overflow-hidden rounded-b-2xl pointer-events-none">
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-black/20 rounded-full blur-xl" />
      </div>

      {/* Top Row: User Avatar / MDC Logo & User Greeting & Logout Button */}
      <div className="relative flex items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Logo MDC */}
          <div className="relative flex-shrink-0 w-9 h-9">
            <div className="w-full h-full rounded-xl bg-white/15 border border-white/30 backdrop-blur-md p-1.5 flex items-center justify-center shadow-xs overflow-hidden">
              <img
                src="/icon-192.png"
                alt="Logo MDC"
                className="w-full h-full object-contain drop-shadow-xs"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = parent.querySelector('.mdc-text-logo');
                    if (fallback) fallback.classList.remove('hidden');
                  }
                }}
              />
              <span className="mdc-text-logo hidden text-[10px] font-black tracking-wider text-white font-mono">
                MDC
              </span>
            </div>
            {/* Indikator Online Hijau (Posisinya presisi di sudut luar tanpa terpotong bentuk rounded/overflow-hidden) */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 z-10 pointer-events-none">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border-2 border-[#8b151b] shadow-xs" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-white/75 font-medium">Selamat Datang,</span>
              <span className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded-full bg-black/30 text-amber-300 font-semibold border border-amber-300/30 flex-shrink-0">
                <Shield className="w-2 h-2" /> PDI Man
              </span>
            </div>
            <h2 className="text-xs font-bold text-white truncate leading-tight tracking-wide mt-0.5">
              {user?.nama || 'PDI Man Dealer'}
            </h2>
          </div>
        </div>

        {/* Tombol Notifikasi & Logout */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {notificationSlot}
          <button
            type="button"
            onClick={onLogout}
            title="Keluar dari Akun"
            className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 border border-white/20 transition-all text-white/90 hover:text-white flex-shrink-0 cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Frosted Dealer Badge Card (Compact) */}
      <div className="relative rounded-xl bg-black/30 backdrop-blur-md border border-white/15 px-2.5 py-1.5 text-xs shadow-inner">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 truncate text-white/95 font-semibold">
            <Building2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="truncate text-[11px]">{namaDealer}</span>
          </div>
          <span className="flex-shrink-0 text-[9.5px] px-1.5 py-0.5 rounded-md bg-white/20 font-mono font-bold tracking-wider text-white border border-white/25">
            {kodeDealer}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/80 pt-1 border-t border-white/10">
          <div className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 text-red-300" />
            <span>Kota : <strong className="text-white">{kotaFormatted}</strong></span>
          </div>
          <div>
            <span>Asal Gudang : <strong className="text-amber-300 font-semibold">{asalGudang}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
