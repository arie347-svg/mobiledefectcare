import React, { useState, useRef, useEffect } from 'react';
import { ClaimItem } from '../types';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Wrench,
  ChevronRight,
  FileEdit,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { hitungAktualHariKerja, hitungEstimasiSelesai, TARGET_LEADTIME_HARI_KERJA } from '../utils/slaCalculator';

interface ClaimCardProps {
  claim: ClaimItem;
  viewMode: 'CARDS' | 'SIMPLE';
  currentUserRole?: string;
  onClick: () => void;
}

interface ContactOption {
  label: string;
  phone: string;
}
 
export const ClaimCard = React.memo<ClaimCardProps>(({ claim, viewMode, currentUserRole, onClick }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const motorSummary = React.useMemo(() => {
    if (claim.items && claim.items.length > 0) {
      const uniqueMotors = Array.from(new Set(claim.items.map((i) => i.tipe).filter(Boolean)));
      const motorName = uniqueMotors.join(', ') || claim.tipeMotor || 'BEAT STREET';
      const partCount = claim.items.length;
      return `${motorName} - ${partCount} part`;
    }
    const fallbackMotor = claim.tipeMotor || 'BEAT STREET';
    return `${fallbackMotor} - 1 part`;
  }, [claim.items, claim.tipeMotor]);

  const STATUS_TOOLTIPS: Record<string, { label: string; desc: string }> = {
    'Draft': {
      label: 'Draft Lokal (24 Jam)',
      desc: 'Klaim tersimpan sementara di perangkat dan belum dikirimkan ke Main Dealer.',
    },
    'Dikirim ke MD': {
      label: 'Terkirim ke Main Dealer',
      desc: 'Klaim diserahkan ke MD dan menunggu verifikasi fisik serta dokumen oleh petugas.',
    },
    'Proses di MD': {
      label: 'Sedang Proses di MD',
      desc: 'Unit atau part sedang dianalisa dan dalam pengerjaan teknis oleh repairman MD.',
    },
    'Dikirim ke Dealer': {
      label: 'Pengiriman ke Dealer',
      desc: 'Proses selesai di MD dan part/unit sedang dikirim kembali ke dealer via transporter.',
    },
    'Selesai': {
      label: 'Klaim Selesai',
      desc: 'Seluruh tahapan klaim tuntas dan serah terima part/unit telah diselesaikan.',
    },
  };

  const getStatusBadge = (status: string) => {
    const tooltipInfo = STATUS_TOOLTIPS[status] || {
      label: status,
      desc: `Status klaim saat ini: ${status}`,
    };

    let badgeNode: React.ReactNode = null;
    switch (status) {
      case 'Draft':
        badgeNode = (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
            <FileEdit className="w-2.5 h-2.5 text-slate-500" /> Draft
          </span>
        );
        break;
      case 'Dikirim ke MD':
        badgeNode = (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-300 whitespace-nowrap">
            <Clock className="w-2.5 h-2.5 text-sky-600" /> Dikirim ke MD
          </span>
        );
        break;
      case 'Proses di MD':
        badgeNode = (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap">
            <Wrench className="w-2.5 h-2.5 text-amber-600" /> Proses di MD
          </span>
        );
        break;
      case 'Dikirim ke Dealer':
        badgeNode = (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-300 whitespace-nowrap">
            <Clock className="w-2.5 h-2.5 text-indigo-600" /> Kirim ke Dealer
          </span>
        );
        break;
      case 'Selesai':
        badgeNode = (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 whitespace-nowrap">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Selesai
          </span>
        );
        break;
      default:
        badgeNode = (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 whitespace-nowrap">
            {status}
          </span>
        );
    }

    return (
      <div
        className="group/status relative inline-flex items-center cursor-help"
        onClick={(e) => e.stopPropagation()}
        title={`${tooltipInfo.label}: ${tooltipInfo.desc}`}
      >
        {badgeNode}

        {/* Floating Tooltip Bubble */}
        <div
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full mt-1.5 w-52 p-2 rounded-xl bg-slate-950/95 text-white border border-white/20 shadow-2xl backdrop-blur-md opacity-0 scale-95 group-hover/status:opacity-100 group-hover/status:scale-100 transition-all duration-150 z-50 text-left"
        >
          <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold text-amber-300 leading-tight">
              {tooltipInfo.label}
            </span>
          </div>
          <p className="text-[9.5px] leading-relaxed text-white/80 font-normal">
            {tooltipInfo.desc}
          </p>
          {/* Arrow pointing up */}
          <div className="absolute right-3 -top-1 w-2 h-2 bg-slate-950 border-l border-t border-white/20 transform rotate-45" />
        </div>
      </div>
    );
  };

  // Logika Matriks Kontak & Hak Akses Role
  const getAvailableContacts = (): ContactOption[] => {
    const status = (claim.status || '').trim().toLowerCase();
    const role = (currentUserRole || '').trim().toLowerCase();
    const contacts: ContactOption[] = [];

    const isPdiMan = role === 'pdi man';
    const isRepairman = role === 'repairman' || role === 'repairmen';
    const isKepalaGudang = role === 'kepala gudang';

    // 1. STATUS DRAFT: Tidak ada menu/tombol kontak yang muncul sama sekali
    if (status.includes('draft')) {
      return [];
    }

    const pengurusPhone = claim.kontakPengurusKembali || claim.kontakPengurusPJ || '';
    const repairmanPhone = claim.kontakRepairman || '';
    const pdiPhone = claim.noHpPdi || '';

    // 2. STATUS "DIKIRIM KE MD"
    // Kontak: "Ekspedisi" & "Repairman"
    // Hak Akses: HANYA role "PDI Man"
    if (status.includes('dikirim ke md')) {
      if (isPdiMan) {
        if (pengurusPhone) contacts.push({ label: 'Ekspedisi', phone: pengurusPhone });
        if (repairmanPhone) contacts.push({ label: 'Repairman', phone: repairmanPhone });
      }
      return contacts;
    }

    // 3. STATUS "PROSES DI MD"
    // Kontak: "Repairman"
    // Hak Akses: HANYA role "PDI Man" dan "Kepala Gudang"
    if (status.includes('proses di md')) {
      if (isPdiMan || isKepalaGudang) {
        if (repairmanPhone) contacts.push({ label: 'Repairman', phone: repairmanPhone });
      }
      return contacts;
    }

    // 4. STATUS "DIKIRIM KE DEALER"
    // Kontak:
    // - "Ekspedisi": dapat dilihat oleh "Repairman", "Kepala Gudang", dan "PDI Man"
    // - "PDI Man": HANYA dapat dilihat oleh "Repairman" dan "Kepala Gudang"
    if (status.includes('dikirim ke dealer')) {
      if (isRepairman || isKepalaGudang || isPdiMan) {
        if (pengurusPhone) contacts.push({ label: 'Ekspedisi', phone: pengurusPhone });
      }
      if (isRepairman || isKepalaGudang) {
        if (pdiPhone) contacts.push({ label: 'PDI Man', phone: pdiPhone });
      }
      return contacts;
    }

    // Status lainnya (misal: "Selesai", "Ditolak"): tidak menampilkan kontak
    return [];
  };

  const availableContacts = getAvailableContacts();

  const handleWhatsAppAction = (phone: string, targetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    const message = encodeURIComponent(`Halo ${targetName}, terkait pengajuan klaim MDC Mobile ${claim.idKlaim}...`);
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    setIsDropdownOpen(false);
  };

  const isSelesai = (claim.status || '').toLowerCase() === 'selesai';
  const isDraft = (claim.status || '').toLowerCase() === 'draft';
  const aktualHari = isSelesai ? hitungAktualHariKerja(claim.rawDate || claim.tgl, claim.tglSelesai) : 0;
  const targetLeadtimeHari = TARGET_LEADTIME_HARI_KERJA; // Target standar SLA perbaikan AHM/MD (8 hari kerja)
  const estSelesai = !isSelesai && !isDraft ? hitungEstimasiSelesai(claim.rawDate || claim.tgl, claim.mdTargetSelesai) : '';
  const tglPengajuan = claim.tgl ? claim.tgl.split(' ')[0] : '-';
  const driverName = claim.sopirPJ || claim.sopirKembali || claim.namaSopir || '-';
  const transporterName = claim.transporterPJ || claim.transporterKembali || 'Transporter';

  // 1. MODE LIST (TAMPILAN DAFTAR - Ringkas, padat & efisien secara vertikal)
  if (viewMode === 'SIMPLE') {
    return (
      <div
        onClick={onClick}
        className="group relative flex items-center justify-between px-3 py-2.5 mb-1.5 rounded-xl bg-white hover:bg-slate-50 active:scale-[0.99] border border-slate-200/90 hover:border-slate-300 shadow-xs transition-all cursor-pointer text-slate-800"
      >
        {/* Sisi Kiri: Nama motor + jumlah part di atas, Sopir + Transporter di bawah */}
        <div className="min-w-0 flex-1 pr-2.5">
          <h4 className="font-bold text-xs text-slate-900 tracking-wide truncate">
            {motorSummary}
          </h4>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            {driverName} • {transporterName}
          </p>
        </div>

        {/* Sisi Kanan: Status di atas, Estimasi / Leadtime di bawah */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
          {getStatusBadge(claim.status)}
          <div className="text-[10px]">
            {isSelesai ? (
              <span className="text-emerald-700 font-semibold font-mono">
                Leadtime {aktualHari}/{targetLeadtimeHari} Hari
              </span>
            ) : isDraft ? (
              <span className="text-slate-400 italic">Draft</span>
            ) : (
              <span className="text-slate-500 font-mono">
                EstSelesai: <strong className="text-slate-800 font-mono">{estSelesai}</strong>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. MODE GRID (TAMPILAN KOTAK - Padat, Lengkap dengan WhatsApp & Tautan "Detail >")
  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl p-3 mb-2 bg-white hover:bg-slate-50/80 active:scale-[0.99] border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all cursor-pointer text-slate-800"
    >
      {/* Baris Atas: Ringkasan Motor & Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="font-bold text-xs text-slate-900 tracking-wide truncate flex-1">
          {motorSummary}
        </h4>
        <div className="flex-shrink-0">{getStatusBadge(claim.status)}</div>
      </div>

      {/* Baris Tengah: Info Sopir + Transporter & Leadtime / Estimasi Selesai */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 py-1.5 border-t border-slate-100">
        <div className="min-w-0 flex-1 pr-2 truncate">
          <span className="text-slate-400">Sopir: </span>
          <strong className="text-slate-800">{driverName}</strong>
          <span className="text-slate-300 mx-1">•</span>
          <span className="text-slate-600">{transporterName}</span>
        </div>

        <div className="text-right flex-shrink-0">
          {isSelesai ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 font-mono">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Leadtime {aktualHari}/{targetLeadtimeHari} Hari
            </span>
          ) : isDraft ? (
            <span className="inline-flex items-center gap-1 text-slate-400 italic">
              <Clock className="w-3 h-3 text-slate-400" /> Draft
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-slate-600 font-mono">
              <Clock className="w-3 h-3 text-amber-500" />
              Est: <strong className="text-slate-800 font-mono">{estSelesai}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Operasional MD info banner jika sedang dalam perbaikan */}
      {claim.status === 'Proses di MD' && (
        <div className="mt-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 px-2.5 py-1 flex items-center justify-between text-[10.5px]">
          <div className="truncate pr-2">
            <span className="text-slate-500">Perbaikan: </span>
            <strong className="text-amber-800 font-semibold">{claim.mdJenisPerbaikan || 'Pengerjaan Teknis'}</strong>
          </div>
          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${claim.mdValidasiRepairman === 'Valid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800'}`}>
            {claim.mdValidasiRepairman === 'Valid' ? 'QC Valid' : 'Pengerjaan'}
          </span>
        </div>
      )}

      {/* Baris Bawah: Tanggal Pengajuan & Aksi (Kontak WhatsApp & Tautan Detail >) */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
        <div className="flex items-center gap-1 text-slate-500">
          <Calendar className="w-3 h-3 text-red-500" />
          <span>{tglPengajuan}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0" ref={dropdownRef}>
          {/* Tombol Dropdown Kontak WhatsApp Interaktif */}
          {availableContacts.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[10px] font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              >
                <MessageSquare className="w-2.5 h-2.5" />
                <span>Kontak</span>
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1.5 w-48 rounded-xl bg-white border border-slate-200 shadow-xl p-1 z-40 space-y-0.5">
                  <div className="px-2 py-1 text-[9px] font-bold tracking-wider text-slate-600 uppercase border-b border-slate-100">
                    Hubungi via WhatsApp
                  </div>
                  <div className="p-0.5 space-y-0.5">
                    {availableContacts.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => handleWhatsAppAction(c.phone, c.label, e)}
                        className="w-full px-2 py-1.5 rounded-lg hover:bg-emerald-50 active:scale-[0.98] border border-transparent hover:border-emerald-200 text-slate-700 hover:text-emerald-900 transition-all flex items-center justify-between gap-1.5 group/item cursor-pointer"
                      >
                        <span className="text-[11px] font-semibold text-slate-800 group-hover/item:text-emerald-900 truncate">
                          {c.label}
                        </span>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 flex-shrink-0">
                          <MessageSquare className="w-2 h-2" />
                          Chat
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teks Tautan "Detail >" */}
          <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-0.5 text-red-600 hover:text-red-700 font-bold group-hover:translate-x-0.5 transition-transform cursor-pointer text-[10.5px]"
          >
            <span>Detail &gt;</span>
          </button>
        </div>
      </div>
    </div>
  );
});