import React from 'react';
import { UserProfile } from '../types';
import { LogOut, Building2, MapPin, Shield } from 'lucide-react';

interface HeaderProfileProps {
  user: UserProfile;
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

  // Inisial huruf depan nama PDI Man
  const inisialNama = (() => {
    if (!user?.nama) return 'P';
    const clean = user.nama.trim();
    if (!clean) return 'P';
    const firstWord = clean.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() : 'P';
  })();

  return (
    <div className="relative rounded-b-2xl bg-gradient-to-r from-red-600 via-red-600 to-red-700 text-white px-3.5 py-2.5 shadow-md border-b border-red-800/30">
      {/* Top Row: User Avatar Inisial & User Greeting & Logout Button */}
      <div className="relative flex items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar Inisial Nama Depan PDI Man */}
          <div className="relative flex-shrink-0 w-9 h-9">
            <div className="w-full h-full rounded-xl bg-white flex items-center justify-center shadow-xs overflow-hidden border border-red-100 select-none">
              <span className="text-base font-black tracking-tight text-red-600 font-sans leading-none">
                {inisialNama}
              </span>
            </div>
            {/* Indikator Online Hijau */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 z-10 pointer-events-none">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border-2 border-red-600 shadow-xs" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-white/90 font-medium">Selamat Datang,</span>
              <span className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded-full bg-black/20 text-amber-200 font-semibold border border-white/20 flex-shrink-0">
                <Shield className="w-2 h-2 text-amber-300" /> PDI Man
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
            className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 border border-white/25 transition-all text-white hover:text-white flex-shrink-0 cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Clean White Dealer Badge Card */}
      <div className="relative rounded-xl bg-white text-slate-900 border border-red-100 px-3 py-2 text-xs shadow-md">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 truncate text-slate-900 font-bold">
            <Building2 className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
            <span className="truncate text-[11px] font-bold">{namaDealer}</span>
          </div>
          <span className="flex-shrink-0 text-[9.5px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 font-mono font-bold tracking-wider border border-red-200/80">
            {kodeDealer}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 text-red-500" />
            <span>Kota : <strong className="text-slate-800">{kotaFormatted}</strong></span>
          </div>
          <div>
            <span>Asal Gudang : <strong className="text-red-700 font-semibold">{asalGudang}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
