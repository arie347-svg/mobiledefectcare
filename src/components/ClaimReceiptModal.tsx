import React, { useState, useMemo } from 'react';
import { ClaimItem, UserProfile } from '../types';
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
  claim: ClaimItem | null;
  user?: UserProfile | null;
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

  if (!claim) return null;

  const totalParts = claim.items?.length || 0;
  // Hitung jumlah unit motor unik
  const uniqueMotors = new Set(
    (claim.items || []).map((it) => it.noMesin || it.tipe || '1')
  );
  const motorCount = uniqueMotors.size || 1;

  const namaDealer = claim.namaDealer || user?.namaDealer || 'Dealer Honda';
  const kodeAhm = claim.kodeAhm || user?.kodeAhm || '-';
  const kodeDealer = claim.kodeDealer || user?.kodeDealer || '-';

  // Format stempel waktu akurat saat tombol kirim ditekan
  const formattedTimestamp = useMemo(() => {
    if (claim.rawTimestamp) {
      const d = new Date(claim.rawTimestamp);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Jakarta',
        });
        const timePart = d.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Jakarta',
        });
        return `${datePart}, ${timePart} WIB`;
      }
    }
    if (claim.rawDate) {
      const d = new Date(claim.rawDate);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Jakarta',
        });
        const timePart = d.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Jakarta',
        });
        return `${datePart}, ${timePart} WIB`;
      }
    }
    return claim.tgl || new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [claim.rawTimestamp, claim.rawDate, claim.tgl]);

  const handleCopyId = () => {
    try {
      navigator.clipboard.writeText(claim.idKlaim);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (_) {
      setToastMessage('Gagal menyalin ID Klaim.');
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  // Handler Bagikan File PDF LKUAT via Web Share API
  const handleShareLkuatPdf = async () => {
    setIsSharing(true);
    try {
      const filename = getLkuatPdfFilename(claim, user);
      const pdfBlob = await generateLkuatPdfBlob(claim, user);
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      const docBaseName = filename.replace(/\.pdf$/i, '');

      // Coba bagikan file PDF via Web Share API
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [pdfFile] })
      ) {
        await navigator.share({
          title: docBaseName,
          text: `Resi Pengiriman Klaim ID #${claim.idKlaim} - ${namaDealer}`,
          files: [pdfFile],
        });
        return;
      } else if (navigator.share) {
        // Fallback share text bila browser tidak mendukung share file
        await navigator.share({
          title: docBaseName,
          text: `Resi Pengiriman Klaim ID #${claim.idKlaim} (${namaDealer}) - Status: Dikirim ke MD, Total: ${totalParts} Part (${motorCount} Unit)`,
        });
        return;
      }

      // Fallback unduh otomatis jika Web Share API tidak tersedia di browser
      const doc = await generateLkuatPdf(claim, user);
      doc.save(filename);
      setToastMessage('Dokumen LKUAT PDF berhasil diunduh!');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Share LKUAT Error:', err);
      // Fallback download manual jika share error
      try {
        const doc = await generateLkuatPdf(claim, user);
        doc.save(getLkuatPdfFilename(claim, user));
        setToastMessage('Dokumen LKUAT PDF berhasil diunduh!');
        setTimeout(() => setToastMessage(null), 3500);
      } catch (_) {
        setToastMessage('Gagal menyiapkan dokumen PDF.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-4 left-4 right-4 z-50 p-3 rounded-xl bg-slate-900 text-white border border-slate-700 text-xs text-center font-medium shadow-2xl animate-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Kartu Resi Bersih Putih Pas 1 Layar Tanpa Scroll */}
      <div className="w-full max-w-sm h-auto max-h-[96dvh] flex flex-col justify-between overflow-hidden bg-white text-slate-900 border border-slate-200 shadow-2xl rounded-3xl p-5 relative select-none">
        
        {/* Tombol Tutup (X) di Pojok Kanan Atas */}
        <button
          type="button"
          onClick={onClose}
          title="Tutup Resi"
          aria-label="Tutup Resi"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Bagian Atas: HANYA Icon Checklist Hijau Beranimasi (Tanpa Teks Deskripsi Status) */}
        <div className="flex flex-col items-center pt-2 pb-2">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-14 h-14 rounded-full bg-emerald-500/20 animate-ping duration-1000 opacity-60" />
            <div className="relative w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-500/15">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
          </div>
        </div>

        {/* Kotak Fisik Lembar Struk (Teks Kontras Bersih di atas Background Netral) */}
        <div className="rounded-2xl bg-slate-50/90 border border-slate-200 p-4 space-y-3 my-1">
          
          {/* Header Resi: ID Klaim Resmi & Tombol Salin */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">
                ID Klaim Resmi
              </span>
              <span className="text-sm font-mono font-bold text-slate-900 tracking-wider">
                {claim.idKlaim}
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
            {/* Stempel Waktu Pengiriman */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Waktu Pengiriman</span>
              <span className="font-mono text-[11px] font-semibold text-slate-800 text-right">
                {formattedTimestamp}
              </span>
            </div>

            {/* Garis Pemisah Halus */}
            <div className="border-t border-slate-200/80 my-1" />

            {/* Identitas Dealer: Nama Dealer & Kode AHM */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Nama Dealer</span>
              <span className="font-bold text-slate-900 truncate max-w-[190px] text-right">
                {namaDealer}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Kode AHM</span>
              <span className="font-mono font-bold text-slate-900 tracking-wide">
                {kodeAhm}
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

            {/* Garis Pemisah Halus */}
            <div className="border-t border-slate-200/80 my-1" />

            {/* Ringkasan Unit Motor & Suku Cadang */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Unit Motor</span>
              <span className="font-bold text-slate-900 font-mono">
                {motorCount} Unit
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Suku Cadang</span>
              <span className="font-extrabold text-slate-900 font-mono">
                {totalParts} Part
              </span>
            </div>
          </div>

          {/* Watermark Ringkas Pengesahan */}
          <div className="pt-2 border-t border-slate-200 text-center">
            <span className="text-[9px] text-slate-400 font-mono block">
              Tercatat Resmi di MDC Mobile Honda
            </span>
          </div>
        </div>

        {/* Footer: HANYA SATU TOMBOL AKSI BAGIKAN (SHARE) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleShareLkuatPdf}
            disabled={isSharing}
            className="w-full py-3.5 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-60"
          >
            {isSharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Menyiapkan Dokumen PDF...</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Bagikan Resi (PDF)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
