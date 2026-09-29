import React, { useState, useMemo } from 'react';
import { ClaimItem, ClaimPartDetail, UserProfile } from '../types';
import {
  X,
  Share2,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  generateLkuatPdf,
  generateLkuatPdfBlob,
  getLkuatPdfFilename,
} from '../utils/lkuatGenerator';

interface ClaimReceiptModalProps {
  claim: any;
  user: UserProfile | null;
  onClose: () => void;
}

export const ClaimReceiptModal: React.FC<ClaimReceiptModalProps> = ({
  claim,
  user,
  onClose,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Format Nama Dealer & Kode Dealer
  const namaDealer = useMemo(() => {
    return claim?.namaDealer || user?.namaDealer || 'Dealer Honda';
  }, [claim, user]);

  const kodeDealer = useMemo(() => {
    return claim?.kodeDealer || user?.kodeDealer || '-';
  }, [claim, user]);

  const kotaDealer = useMemo(() => {
    return claim?.kota || user?.kota || '-';
  }, [claim, user]);

  // Format Waktu Pengiriman
  const formattedTimestamp = useMemo(() => {
    const raw = claim?.timestamp || claim?.tglPeriksa || new Date();
    if (!raw) return '-';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw.toString();
      const dd = String(d.getDate()).padStart(2, '0');
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
      const mmm = months[d.getMonth()];
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${dd} ${mmm} ${yyyy} • ${hh}:${mm} WIB`;
    } catch {
      return raw.toString();
    }
  }, [claim]);

  // Hitung Total Unit Motor & Total Part
  const { motorCount, totalParts } = useMemo(() => {
    const items: ClaimPartDetail[] = claim?.items || [];
    const uniqueMotors = new Set(items.map((i) => i.tipe).filter(Boolean));
    return {
      motorCount: uniqueMotors.size > 0 ? uniqueMotors.size : 1,
      totalParts: items.length,
    };
  }, [claim]);

  // Handler Salin ID Klaim
  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!claim?.idKlaim) return;
    navigator.clipboard.writeText(claim.idKlaim);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Handler Bagikan Resi PDF
  const handleShareLkuatPdf = async () => {
    if (!claim) return;
    setIsSharing(true);
    try {
      const filename = getLkuatPdfFilename(claim, user);
      const pdfBlob = await generateLkuatPdfBlob(claim, user);
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Form LKUAT - ${claim.idKlaim}`,
          text: `Berikut terlampir dokumen LKUAT untuk Klaim #${claim.idKlaim}`,
        });
      } else {
        generateLkuatPdf(claim, user);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Share PDF Error:', err);
        generateLkuatPdf(claim, user);
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="absolute top-6 z-50 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xl border border-slate-700 animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Kartu Resi */}
      <div 
        className="w-full max-w-sm h-auto max-h-[96dvh] flex flex-col justify-between overflow-hidden bg-white text-slate-900 border border-slate-200 shadow-2xl rounded-3xl p-5 relative select-none"
      >
        
        {/* Tombol Tutup (X) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Tutup Resi & Kembali ke Halaman Utama"
          aria-label="Tutup Resi & Kembali ke Halaman Utama"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Bagian Atas: Icon Checklist Hijau Beranimasi */}
        <div className="flex flex-col items-center pt-2 pb-2">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-14 h-14 rounded-full bg-emerald-500/20 animate-ping duration-1000 opacity-60" />
            <div className="relative w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-500/15">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
          </div>
        </div>

        {/* Kotak Fisik Lembar Struk */}
        <div className="rounded-2xl bg-slate-50/90 border border-slate-200 p-4 space-y-3 my-1">
          
          {/* Header Resi: ID Klaim Resmi & Tombol Salin */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">
                ID Klaim Resmi
              </span>
              <span className="text-sm font-mono font-bold text-slate-900 tracking-wider">
                {claim?.idKlaim || '-'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyId}
              title="Salin ID Klaim"
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 active:scale-95 text-[10px] font-semibold text-slate-700 border border-slate-200 flex items-center gap-1 transition-all cursor-pointer shadow-xs"
            >
              {copiedText ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-600 font-bold">Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-500" />
                  <span>Salin ID</span>
                </>
              )}
            </button>
          </div>

          {/* Rincian Ringkas Data Klaim */}
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Waktu Pengiriman</span>
              <span className="font-mono text-[11px] font-semibold text-slate-800 text-right">
                {formattedTimestamp}
              </span>
            </div>

            <div className="border-t border-slate-200/80 my-1" />

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Nama Dealer</span>
              <span className="font-bold text-slate-900 truncate max-w-[190px] text-right">
                {namaDealer}
              </span>
            </div>

            {kodeDealer && kodeDealer !== '-' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Kode Dealer</span>
                <span className="font-mono font-bold text-red-600 tracking-wider">
                  {kodeDealer}
                </span>
              </div>
            )}

            <div className="border-t border-slate-200/80 my-1" />

            {claim?.fotoSopirPJ && (
              <div className="flex justify-center my-1">
                <img
                  src={claim.fotoSopirPJ}
                  alt="Bukti Foto Sopir"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 object-cover rounded-xl border border-slate-200 shadow-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Diketahui Oleh Sopir</span>
              <span className="font-bold text-slate-900 text-right">
                {claim?.sopirPJ ? `${claim.sopirPJ}${claim?.transporterPJ ? `.${claim.transporterPJ}` : ''}` : '-'}
              </span>
            </div>

            <div className="border-t border-slate-200/80 my-1" />

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Unit Motor</span>
              <span className="font-bold text-slate-900 font-mono">
                {motorCount} Unit
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Part</span>
              <span className="font-extrabold text-slate-900 font-mono">
                {totalParts} Part
              </span>
            </div>
          </div>
        </div>

        {/* Footer: Tombol Aksi Bagikan LKUAT (PDF) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleShareLkuatPdf}
            disabled={isSharing}
            className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-60"
          >
            {isSharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Menyiapkan Dokumen PDF...</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Bagikan LKUAT (PDF)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};