import React, { useState, useRef, useEffect } from 'react';
import { ClaimItem, UserProfile } from '../types';
import {
  X,
  Store,
  Truck,
  Wrench,
  CornerUpLeft,
  CheckCircle2,
  Phone,
  MessageCircle,
  Clock,
  AlertTriangle,
  Image as ImageIcon,
  ExternalLink,
  Edit3,
  Eye,
  Share2,
  Download,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {
  formatTimestampWIB,
  hitungSisaJamKerja,
  hitungEstimasiSelesai,
  parseTanggalAman,
  isHariLiburAtauMinggu,
} from '../utils/slaCalculator';
import {
  generateLkuatPdf,
  generateLkuatPdfBlob,
  getLkuatPdfFilename,
} from '../utils/lkuatGenerator';

interface ClaimDetailModalProps {
  claim: ClaimItem | null;
  user?: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onEditDraft?: (claim: ClaimItem) => void;
  onConfirmFinish?: (claimId: string) => void;
  onConfirmRetur?: (claimId: string, alasan: string) => void;
  onPreviewPhoto: (url: string, title: string) => void;
}

// Helper untuk membersihkan URL foto Google Drive menjadi direct link
const getCleanPhotoUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:image')) return url;
  const match = url.match(/[-\w]{25,}/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[0]}`;
  return url;
};

// Helper untuk konversi URL foto menjadi Base64 (untuk jsPDF)
const loadImgBase64 = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    if (!url) return resolve('');
    if (url.startsWith('data:image')) return resolve(url);
    const cleanUrl = getCleanPhotoUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
          return;
        }
      } catch (e) {
        console.warn('Canvas toDataURL warning:', e);
      }
      resolve('');
    };
    img.onerror = () => resolve('');
    setTimeout(() => resolve(''), 3500); // 3.5s timeout fallback
    img.src = cleanUrl;
  });
};

// Helper memastikan modul jsPDF & autoTable termuat
const ensureJsPdfLoaded = async (): Promise<any> => {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf;
  return new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = () => resolve((window as any).jspdf);
      s2.onerror = () => reject(new Error('Gagal memuat autoTable CDN'));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error('Gagal memuat jsPDF CDN'));
    document.head.appendChild(s1);
  });
};

export const ClaimDetailModal: React.FC<ClaimDetailModalProps> = ({
  claim,
  user,
  isOpen,
  onClose,
  onEditDraft,
  onConfirmFinish,
  onConfirmRetur,
  onPreviewPhoto,
}) => {
  // Determine active step (1 to 5)
  let activeStep = 1;
  if (claim?.status === 'Draft') activeStep = 1;
  else if (claim?.status === 'Dikirim ke MD') activeStep = 2;
  else if (claim?.status === 'Proses di MD') activeStep = 3;
  else if (claim?.status === 'Dikirim ke Dealer') activeStep = 4;
  else if (claim?.status === 'Selesai') activeStep = 5;

  const [selectedStepView, setSelectedStepView] = useState<number>(activeStep);
  const [showExportDropdown, setShowExportDropdown] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showReturForm, setShowReturForm] = useState<boolean>(false);
  const [alasanRetur, setAlasanRetur] = useState<string>('');
  const [isSubmittingRetur, setIsSubmittingRetur] = useState<boolean>(false);
  const [isSubmittingFinish, setIsSubmittingFinish] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (claim) {
      let step = 1;
      if (claim.status === 'Draft') step = 1;
      else if (claim.status === 'Dikirim ke MD') step = 2;
      else if (claim.status === 'Proses di MD') step = 3;
      else if (claim.status === 'Dikirim ke Dealer') step = 4;
      else if (claim.status === 'Selesai') step = 5;
      setSelectedStepView(step);
      setShowReturForm(false);
      setAlasanRetur('');
      setIsSubmittingRetur(false);
      setIsSubmittingFinish(false);
    }
  }, [claim?.idKlaim, claim?.status, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen || !claim) return null;

  const steps = [
    { num: 1, label: 'Di Dealer', icon: Store },
    { num: 2, label: 'Kirim MD', icon: Truck },
    { num: 3, label: 'Proses MD', icon: Wrench },
    { num: 4, label: 'Kirim Dlr', icon: CornerUpLeft },
    { num: 5, label: 'Selesai', icon: CheckCircle2 },
  ];

  const getStepTimer = (stepNum: number) => {
    if (stepNum === 5) {
      try {
        const estText = hitungEstimasiSelesai(claim.rawDate || claim.tgl, claim.mdTargetSelesai);
        return (
          <span className="text-[8px] font-mono text-emerald-300 font-bold whitespace-nowrap bg-emerald-950/90 px-1 py-0.5 rounded border border-emerald-500/30">
            Est : {estText}
          </span>
        );
      } catch (_) {
        return (
          <span className="text-[8px] font-mono text-emerald-300 font-bold whitespace-nowrap bg-emerald-950/90 px-1 py-0.5 rounded border border-emerald-500/30">
            Est : -
          </span>
        );
      }
    }

    if (stepNum !== activeStep || activeStep === 5) return null;
    const baseHours = activeStep === 1 ? 24 : activeStep === 3 ? 72 : 24;
    const sisaJam = hitungSisaJamKerja(claim.rawDate || claim.tgl, baseHours);

    let color = 'bg-white/10 text-red-300 border-red-500/30';
    let text = `${sisaJam}j lagi`;
    if (sisaJam <= 0) {
      color = 'bg-red-600 text-white border-red-400 animate-pulse';
      text = 'Lewat SLA';
    } else if (sisaJam <= 4) {
      color = 'bg-red-600/80 text-white border-red-400 animate-pulse';
      text = `${sisaJam}j lagi`;
    } else if (sisaJam <= 12) {
      color = 'bg-amber-500/20 text-amber-300 border-amber-400/40';
      text = `${sisaJam}j lagi`;
    }

    return (
      <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${color}`}>
        <Clock className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{text}</span>
      </span>
    );
  };

  const cleanPhone = (num?: string) => (num || '').replace(/[^0-9]/g, '');
  const waPengurus = cleanPhone(claim.kontakPengurusKembali || claim.kontakPengurusPJ);
  const waRepairman = cleanPhone(claim.kontakRepairman);

  // 1. Handler Tombol Mata: Pratinjau Presisi Sesuai Template Standar Resmi (Image 3)
  const handleViewPdf = () => {
    const formattedTglPemeriksaan = (claim.tglPeriksa || claim.rawDate || claim.tgl || '').split(' ')[0];
    const formattedTglDo = (claim.tglDo || '').split(' ')[0];
    const namaDealer = claim.namaDealer || user?.namaDealer || 'Merdeka Motor';
    const namaPemeriksaLengkap = user?.nama || claim.parafUser || '01203820 ARI IMAM SAFARI';
    const jenisPerbaikan = (claim.mdJenisPerbaikan && claim.mdJenisPerbaikan.trim()) ? claim.mdJenisPerbaikan.trim() : '-';
    const tglSelesaiVal = claim.tglSelesai || (claim.status === 'Selesai' ? (claim.rawDate || claim.tgl || '-') : '-');
    const timestampVerif = `${formattedTglPemeriksaan} 21:32`;

    // Render baris rincian suku cadang
    const itemsHtml = (claim.items || [])
      .map((item, idx) => {
        const photoUrl = getCleanPhotoUrl(item.fotoPart);
        return `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; font-size: 9px;">${idx + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center;">
            ${
              photoUrl
                ? `<img src="${photoUrl}" referrerpolicy="no-referrer" crossorigin="anonymous" style="max-height: 48px; max-width: 65px; object-fit: cover; border-radius: 2px; border: 1px solid #e2e8f0; display: inline-block;" />`
                : `<span style="font-size: 8px; color: #94a3b8; font-weight: bold;">[No Foto]</span>`
            }
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 6px; font-weight: bold; text-align: left; font-size: 9px;">${item.namaPart || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 6px; text-align: left; font-size: 9px;">${item.kerusakan || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 6px; text-align: left; font-size: 9px;">${item.penyebab || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; font-family: monospace; font-size: 8.5px; text-align: center;">${item.noMesin || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; font-family: monospace; font-size: 8.5px; text-align: center;">${item.noRangka || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; font-size: 9px;">${item.tipe || '-'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; font-size: 8.5px;">${jenisPerbaikan}</td>
        </tr>
      `;
      })
      .join('');

    // Paraf Sopir (Gambar atau Nama)
    let sopirSignHtml = '';
    if (claim.parafSopirPJ && (claim.parafSopirPJ.startsWith('data:image') || claim.parafSopirPJ.startsWith('http'))) {
      sopirSignHtml = `<img src="${claim.parafSopirPJ}" style="max-height: 40px; max-width: 75px; object-fit: contain;" />`;
    } else {
      sopirSignHtml = `<span style="font-weight: bold; font-size: 10px; color: #1e293b;">${claim.sopirPJ || '-'}</span>`;
    }

    // Paraf Pemeriksa Dealer
    let dealerSignHtml = '';
    if (claim.parafUser && (claim.parafUser.startsWith('data:image') || claim.parafUser.startsWith('http'))) {
      dealerSignHtml = `<img src="${claim.parafUser}" style="max-height: 40px; max-width: 75px; object-fit: contain;" />`;
    } else {
      dealerSignHtml = `<span style="font-weight: bold; font-size: 9.5px; color: #1e293b;">${namaPemeriksaLengkap}</span>`;
    }

    // Evaluasi kondisi tanda tangan sesuai aturan:
    const isReceivedByRepairman = Boolean(
      (claim.mdValidasiRepairman && claim.mdValidasiRepairman.trim() !== '') ||
        ['Proses di MD', 'Dikirim ke Dealer', 'Selesai'].includes(claim.status)
    );

    const isApproved = Boolean(
      (claim.mdApprovalKaGudang && claim.mdApprovalKaGudang.toUpperCase().includes('SETUJU')) ||
        ['Dikirim ke Dealer', 'Selesai'].includes(claim.status)
    );

    // Stamp Validasi Repairman (Hanya terisi jika sudah diterima repairman)
    const repairmanStampHtml = isReceivedByRepairman
      ? `
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <div style="border: 1.5px solid #dc2626; border-radius: 4px; padding: 2px 7px; background: rgba(254, 242, 242, 0.4); text-align: center; width: fit-content;">
          <div style="font-size: 6.5px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px;">MDC VERIFIED</div>
          <div style="font-size: 7.5px; font-weight: 800; color: #b91c1c; margin: 0.5px 0;">TERIMA MD</div>
          <div style="font-size: 6px; font-family: monospace; color: #6b7280;">${timestampVerif}</div>
          <div style="font-size: 6.5px; font-weight: 800; color: #16a34a; letter-spacing: 0.5px;">VALID SYSTEM</div>
        </div>
        <span style="font-size: 6.5px; color: #374151; font-family: monospace; margin-top: 2px;">${timestampVerif}</span>
      </div>
    `
      : '';

    // Stamp Dibuat & Disetujui Admin Main Dealer (Hanya terisi jika approval sudah dilakukan)
    const adminStampDibuatHtml = isApproved
      ? `
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <div style="border: 1.5px solid #dc2626; border-radius: 4px; padding: 2px 7px; background: rgba(254, 242, 242, 0.4); text-align: center; width: fit-content;">
          <div style="font-size: 6.5px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px;">MDC VERIFIED</div>
          <div style="font-size: 7.5px; font-weight: 800; color: #b91c1c; margin: 0.5px 0;">QC MD KLAIM</div>
          <div style="font-size: 6px; font-family: monospace; color: #6b7280;">${timestampVerif}</div>
          <div style="font-size: 6.5px; font-weight: 800; color: #16a34a; letter-spacing: 0.5px;">VALID</div>
        </div>
      </div>
    `
      : '';

    const adminStampDisetujuiHtml = isApproved
      ? `
      <div style="display: inline-flex; flex-direction: column; align-items: center;">
        <div style="border: 1.5px solid #dc2626; border-radius: 4px; padding: 2px 7px; background: rgba(254, 242, 242, 0.4); text-align: center; width: fit-content;">
          <div style="font-size: 6.5px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px;">MDC VERIFIED</div>
          <div style="font-size: 7.5px; font-weight: 800; color: #b91c1c; margin: 0.5px 0;">KA. GUDANG</div>
          <div style="font-size: 6px; font-family: monospace; color: #6b7280;">${timestampVerif}</div>
          <div style="font-size: 6.5px; font-weight: 800; color: #16a34a; letter-spacing: 0.5px;">VALID</div>
        </div>
      </div>
    `
      : '';

    const previewPdfFilename = getLkuatPdfFilename(claim, user);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${previewPdfFilename}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm 10mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            color: #000000;
            margin: 0;
            padding: 12px;
            background: #ffffff;
          }
          .no-print {
            margin-bottom: 12px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
          }
          .btn-print {
            background: #0f172a;
            color: #ffffff;
            border: none;
            padding: 6px 16px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .btn-print:hover { background: #1e293b; }
          
          .doc-title {
            font-size: 12px;
            font-weight: bold;
            color: #0f172a;
            margin-bottom: 8px;
            text-align: left;
            letter-spacing: -0.2px;
          }

          /* Container Bagian Atas: Kiri Info Box, Kanan 3 Kolom Tanda Tangan */
          .top-row {
            display: flex;
            width: 100%;
            margin-bottom: 8px;
            gap: 8px;
          }
          .info-card {
            width: 54%;
            border: 1px solid #cbd5e1;
            border-collapse: collapse;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
          }
          .info-table td {
            padding: 3px 6px;
            vertical-align: top;
          }
          .info-lbl {
            font-weight: bold;
            width: 36%;
            color: #000;
          }
          .info-sep {
            width: 3%;
            text-align: center;
          }
          .info-val {
            width: 61%;
            color: #111;
          }

          .sign-group {
            width: 46%;
            display: flex;
            border: 1px solid #cbd5e1;
          }
          .sign-box {
            flex: 1;
            border-right: 1px solid #cbd5e1;
            display: flex;
            flex-direction: column;
            text-align: center;
          }
          .sign-box:last-child {
            border-right: none;
          }
          .sign-head {
            font-weight: bold;
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            padding: 4px 2px;
            font-size: 8px;
            color: #0f172a;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sign-body {
            flex: 1;
            min-height: 54px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sign-foot {
            font-weight: bold;
            background: #0f172a;
            color: #ffffff;
            padding: 4px 2px;
            font-size: 8px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            letter-spacing: 0.5px;
          }

          /* Tabel Utama Suku Cadang */
          .parts-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          .parts-table th {
            background: #0f172a;
            color: #ffffff;
            border: 1px solid #cbd5e1;
            padding: 6px 3px;
            text-align: center;
            font-size: 8.5px;
            font-weight: bold;
            letter-spacing: 0.3px;
          }
          .parts-table td {
            border: 1px solid #cbd5e1;
            vertical-align: middle;
          }

          /* Bagian Bawah: Admin MD & Tanda Tangan */
          .admin-row {
            display: flex;
            width: 100%;
            margin-bottom: 8px;
            gap: 8px;
          }
          .admin-pengajuan {
            width: 64%;
            border: 1px solid #cbd5e1;
          }
          .admin-head {
            font-weight: bold;
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            padding: 4px 8px;
            font-size: 8px;
            color: #0f172a;
          }
          .admin-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
          }
          .admin-table td {
            padding: 2.5px 8px;
            vertical-align: top;
          }

          .admin-signs {
            width: 36%;
            display: flex;
            border: 1px solid #cbd5e1;
          }
          .admin-foot-bar {
            font-weight: bold;
            background: #0f172a;
            color: #ffffff;
            padding: 2px 2px;
            font-size: 8px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            letter-spacing: 0.5px;
          }

          /* Box Selesai Full Width */
          .selesai-box {
            width: 100%;
            border: 1px solid #cbd5e1;
            padding: 4px 8px;
          }
          .selesai-head {
            font-weight: bold;
            font-size: 8px;
            color: #1e293b;
            margin-bottom: 2px;
          }
          .selesai-body {
            font-size: 8px;
            color: #000;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          @media print {
            .no-print { display: none !important; }
            body { padding: 0 !important; margin: 0 !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button class="btn-print" onclick="window.print()">
            🖨️ Cetak Dokumen / Simpan PDF
          </button>
        </div>

        <!-- Judul Dokumen (Kiri Rata Sesuai Template) -->
        <div class="doc-title">LKUAT (Laporan Kondisi Unit Akibat Transportasi)</div>
        
        <!-- Baris Atas: Info Identitas Klaim & 3 Tanda Tangan -->
        <div class="top-row">
          <div class="info-card">
            <table class="info-table">
              <tr><td class="info-lbl">NAMA DEALER</td><td class="info-sep">:</td><td class="info-val">${namaDealer}</td></tr>
              <tr><td class="info-lbl">TGL DO AHM / MD</td><td class="info-sep">:</td><td class="info-val">${formattedTglDo}</td></tr>
              <tr><td class="info-lbl">No. SJ / SPB</td><td class="info-sep">:</td><td class="info-val">${claim.noSj}</td></tr>
              <tr><td class="info-lbl">NAMA EKSPEDISI</td><td class="info-sep">:</td><td class="info-val">${claim.transporterPJ || '-'}</td></tr>
              <tr><td class="info-lbl">NOMOR POLISI</td><td class="info-sep">:</td><td class="info-val">${claim.nopolPJ || '-'}</td></tr>
              <tr><td class="info-lbl">NAMA SOPIR</td><td class="info-sep">:</td><td class="info-val">${claim.sopirPJ || '-'}</td></tr>
              <tr><td class="info-lbl">TGL PEMERIKSAAN</td><td class="info-sep">:</td><td class="info-val">${formattedTglPemeriksaan}</td></tr>
              <tr><td class="info-lbl">NAMA PEMERIKSA</td><td class="info-sep">:</td><td class="info-val">${namaPemeriksaLengkap}</td></tr>
            </table>
          </div>

          <div class="sign-group">
            <div class="sign-box">
              <div class="sign-head">MENGETAHUI</div>
              <div class="sign-body">${sopirSignHtml}</div>
              <div class="sign-foot">EKSPEDISI</div>
            </div>
            <div class="sign-box">
              <div class="sign-head">DIBUAT</div>
              <div class="sign-body">${dealerSignHtml}</div>
              <div class="sign-foot">DEALER</div>
            </div>
            <div class="sign-box">
              <div class="sign-head">Tanda Diterima oleh Repairman</div>
              <div class="sign-body">${repairmanStampHtml}</div>
              <div class="sign-foot">ADM. REPAIR</div>
            </div>
          </div>
        </div>

        <!-- Tabel Suku Cadang & Motor -->
        <table class="parts-table">
          <thead>
            <tr>
              <th style="width:4%;">No</th>
              <th style="width:10%;">ILUSTRASI</th>
              <th style="width:16%;">PART BERMASALAH</th>
              <th style="width:13%;">GEJALA</th>
              <th style="width:13%;">PENYEBAB</th>
              <th style="width:13%;">No. ENGINE</th>
              <th style="width:14%;">No. FRAME</th>
              <th style="width:8%;">TIPE</th>
              <th style="width:9%;">PERBAIKAN DI MD</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Bagian Pengajuan Klaim Admin Main Dealer + 2 Tanda Tangan -->
        <div class="admin-row">
          <div class="admin-pengajuan">
            <div class="admin-head">PENGAJUAN KLAIM (DIISI OLEH PETUGAS KLAIM ADMIN MAIN DEALER)</div>
            <table class="admin-table">
              <tr><td style="font-weight: bold; width: 36%;">TGL PENGAJUAN KLAIM</td><td style="width: 3%;">:</td><td>${formattedTglPemeriksaan}</td></tr>
              <tr><td style="font-weight: bold;">JENIS PERBAIKAN</td><td>:</td><td>${jenisPerbaikan}</td></tr>
              <tr><td style="font-weight: bold;">KEPUTUSAN</td><td>:</td><td>${claim.status === 'Ditolak' ? 'Ditolak' : 'Diterima'}</td></tr>
              <tr><td style="font-weight: bold;">ALASAN DITOLAK</td><td>:</td><td>-</td></tr>
            </table>
          </div>

          <div class="admin-signs">
            <div class="sign-box">
              <div class="sign-head">DIBUAT</div>
              <div class="sign-body">${adminStampDibuatHtml}</div>
              <div class="admin-foot-bar">Klaim Admin</div>
            </div>
            <div class="sign-box">
              <div class="sign-head">DISETUJUI</div>
              <div class="sign-body">${adminStampDisetujuiHtml}</div>
              <div class="admin-foot-bar">Ka Gudang</div>
            </div>
          </div>
        </div>

        <!-- Kotak Selesai Full Width -->
        <div class="selesai-box">
          <div class="selesai-head">DIISI OLEH PETUGAS KLAIM ADMIN MAIN DEALER JIKA KLAIM SUDAH SELESAI</div>
          <div class="selesai-body">
            <div>TANGGAL SELESAI &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${tglSelesaiVal}</strong></div>
            <div>KELENGKAPAN DOKUMEN : <strong>${claim.idKlaim} (No. SJ: ${claim.noSj})</strong></div>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // 2. Handler Download PDF Presisi Sempurna (jsPDF + autoTable)
  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      const doc = await generateLkuatPdf(claim, user);
      const filename = getLkuatPdfFilename(claim, user);
      doc.save(filename);
      setShowExportDropdown(false);
    } catch (err) {
      console.error('Download PDF Error:', err);
      alert('Terjadi kesalahan saat memproses PDF. Silakan coba kembali.');
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Handler Tombol Bagikan File PDF (Web Share API / Download Fallback)
  const handleSharePdf = async () => {
    setIsExporting(true);
    try {
      const filename = getLkuatPdfFilename(claim, user);
      const pdfBlob = await generateLkuatPdfBlob(claim, user);
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `LKUAT - ${claim.noSj}`,
          files: [pdfFile],
        });
        setShowExportDropdown(false);
        return;
      } else if (navigator.share) {
        const docName = filename.replace(/\.pdf$/i, '');
        await navigator.share({
          title: docName,
          text: `Dokumen LKUAT Klaim No SJ: #${claim.noSj} (${claim.namaDealer})`,
        });
        setShowExportDropdown(false);
        return;
      }

      // Fallback langsung download jika share tidak didukung
      const doc = await generateLkuatPdf(claim, user);
      doc.save(filename);
      setShowExportDropdown(false);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Share error:', err);
      }
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Handler Konfirmasi Retur ke MD (Part Tidak OK)
  const handleKirimRetur = async () => {
    if (!alasanRetur.trim()) {
      alert('Mohon tuliskan alasan atau keterangan kenapa barang diretur.');
      return;
    }
    setIsSubmittingRetur(true);
    try {
      if (onConfirmRetur) {
        await onConfirmRetur(claim.idKlaim, alasanRetur.trim());
      } else {
        alert(`Permintaan retur untuk klaim ${claim.idKlaim} berhasil dikirim.`);
        onClose();
      }
      setShowReturForm(false);
      setAlasanRetur('');
    } catch (err: any) {
      alert(err?.message || 'Gagal mengirim permintaan retur.');
    } finally {
      setIsSubmittingRetur(false);
    }
  };

  // 5. Handler Konfirmasi Terima Part di Dealer (Part OK)
  const handleKonfirmasiTerima = async () => {
    if (!onConfirmFinish || isSubmittingFinish) return;
    setIsSubmittingFinish(true);
    try {
      await onConfirmFinish(claim.idKlaim);
    } catch (err: any) {
      alert(err?.message || 'Gagal memproses konfirmasi terima.');
    } finally {
      setIsSubmittingFinish(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-md my-auto overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-slate-900/95 via-neutral-900/95 to-red-950/90 shadow-2xl backdrop-blur-xl text-white">
        
        {/* HEADER: Hanya ID Klaim & Stempel Waktu Pembuatan (Tanpa No Surat Jalan di Header Atas) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-red-950/60">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-mono text-xs font-black text-amber-400 tracking-wide truncate">
              {claim.idKlaim || `CLM-${claim.noSj}`}
            </h3>
            <p className="text-[10px] text-white/60 font-mono mt-0.5">
              {formatTimestampWIB(claim.rawDate || claim.tgl || claim.rawTimestamp)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 1. Tombol Pratinjau (Mata) */}
            <button
              type="button"
              onClick={handleViewPdf}
              title="Lihat Pratinjau Dokumen LKUAT"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/25 active:scale-95 text-amber-300 hover:text-amber-200 transition-all border border-white/20 flex items-center justify-center cursor-pointer"
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* 2. Tombol Ekspor dengan Dropdown (Bagikan & Download) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                disabled={isExporting}
                title="Ekspor LKUAT PDF"
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:scale-95 text-white text-[11px] font-bold transition-all shadow border border-amber-400/40 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <span>Ekspor</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {/* Menu Dropdown Ekspor */}
              {showExportDropdown && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-slate-900 border border-white/20 shadow-2xl backdrop-blur-xl z-50 overflow-hidden divide-y divide-white/10 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-2 bg-slate-950 text-[10px] font-bold text-amber-300">
                    Opsi Ekspor LKUAT
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleSharePdf}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-white hover:bg-red-600/30 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Bagikan File PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isExporting}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-white hover:bg-red-600/30 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download PDF Resmi</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Tombol Tutup Silang */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors ml-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 max-h-[75vh] overflow-y-auto space-y-4">
          {/* 5-Step Horizontal Tracker Bar - Symmetrical Grid Layout */}
          <div className="relative px-1.5 pt-2.5 pb-2.5 bg-black/30 rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-5 gap-0">
              {steps.map((step) => {
                const isPassed = step.num < activeStep;
                const isCurrent = step.num === activeStep;
                const isSelected = step.num === selectedStepView;
                const isClickable = step.num <= activeStep;
                const Icon = step.icon;

                let iconClass = 'bg-slate-800/90 border-white/20 text-white/40';
                if (isPassed) iconClass = 'bg-emerald-600/30 border-emerald-500 text-emerald-400';
                if (isCurrent) iconClass = 'bg-gradient-to-r from-red-600 to-red-700 border-red-400 text-white shadow-lg shadow-red-900/60 ring-2 ring-red-400';

                return (
                  <div
                    key={step.num}
                    onClick={() => (isClickable ? setSelectedStepView(step.num) : null)}
                    className={`flex flex-col items-center select-none transition-all ${
                      isClickable ? 'cursor-pointer' : 'cursor-default opacity-70'
                    } ${isSelected ? 'scale-[1.03]' : 'opacity-90 hover:opacity-100'}`}
                  >
                    {/* Row 1: Timer Badge (Tinggi konsisten) */}
                    <div className="h-5 flex items-center justify-center mb-1 w-full px-0.5">
                      {getStepTimer(step.num)}
                    </div>

                    {/* Row 2: Node Circle with Connecting Bar */}
                    <div className="relative w-full flex items-center justify-center">
                      {/* Connecting Line Left */}
                      {step.num > 1 && (
                        <div
                          className={`absolute right-1/2 top-1/2 -translate-y-1/2 w-1/2 h-0.5 z-0 ${
                            step.num <= activeStep ? 'bg-emerald-500' : 'bg-white/15'
                          }`}
                        />
                      )}
                      {/* Connecting Line Right */}
                      {step.num < 5 && (
                        <div
                          className={`absolute left-1/2 top-1/2 -translate-y-1/2 w-1/2 h-0.5 z-0 ${
                            step.num < activeStep ? 'bg-emerald-500' : 'bg-white/15'
                          }`}
                        />
                      )}

                      {/* Icon Circle */}
                      <div
                        className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${iconClass}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Row 3: Step Label */}
                    <span
                      className={`text-[9px] font-bold mt-1.5 text-center leading-tight tracking-tight truncate w-full px-0.5 ${
                        isSelected ? 'text-amber-300' : isCurrent ? 'text-white' : 'text-white/60'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dynamic Step Detail Card */}
          <div className="rounded-2xl p-3.5 bg-black/35 border border-white/15 backdrop-blur-md shadow-inner">
            {selectedStepView === 1 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-amber-400" />
                    1. Pemeriksaan di Dealer
                  </h4>
                  {claim.status === 'Draft' && onEditDraft && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditDraft(claim);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all shadow-md shadow-red-900/50"
                    >
                      <Edit3 className="w-3 h-3" />
                      Lanjutkan Draft
                    </button>
                  )}
                </div>
                <p className="text-xs text-white/70">
                  {claim.status === 'Draft'
                    ? 'Klaim berstatus DRAFT titipan. Wajib diselesaikan sebelum batas 24 jam.'
                    : 'Pemeriksaan fisik unit selesai & dokumen serah terima diterbitkan.'}
                </p>
                <div className="mt-2 text-[11px] text-white/60">
                  <span>Tgl DO: <strong>{claim.tglDo || '-'}</strong></span> • <span>Tgl Periksa: <strong>{claim.tglPeriksa || '-'}</strong></span>
                </div>
              </div>
            )}

            {selectedStepView === 2 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-sky-400" />
                    2. Pengiriman ke Main Dealer
                  </h4>
                  {waPengurus && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${waPengurus}`}
                        title="Telepon Pengurus"
                        className="p-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow transition-all flex items-center justify-center"
                      >
                        <Phone className="w-3 h-3" />
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone(waPengurus)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat WhatsApp Pengurus"
                        className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all flex items-center justify-center"
                      >
                        <MessageCircle className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
                <div className="text-xs text-white/85 space-y-1">
                  <div>Driver: <strong className="text-white">{claim.sopirPJ || '-'}</strong> ({claim.nopolPJ || '-'})</div>
                  <div>Transporter: <strong className="text-white">{claim.transporterPJ || '-'}</strong></div>
                </div>
              </div>
            )}

            {selectedStepView === 3 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    3. Proses Pengerjaan di Main Dealer
                  </h4>
                  {/* Hanya PDI Man yang dapat melihat tombol komunikasi Repairman pada status Proses MD */}
                  {user?.role === 'PDI Man' && waRepairman && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${waRepairman}`}
                        title="Telepon Repairman"
                        className="p-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow transition-all flex items-center justify-center"
                      >
                        <Phone className="w-3 h-3" />
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone(waRepairman)}?text=Halo%20Repairman%20MD,%20konfirmasi%20progress%20klaim%20SJ%20${claim.noSj}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat WhatsApp Repairman"
                        className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all flex items-center justify-center"
                      >
                        <MessageCircle className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
                <div className="text-xs text-white/85 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-white/60">Jenis Perbaikan:</span>
                    <strong className="text-amber-300">{claim.mdJenisPerbaikan || 'Menunggu Analisa'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Validasi QC Repairman:</span>
                    <span className={`font-bold ${claim.mdValidasiRepairman === 'Valid' ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {claim.mdValidasiRepairman === 'Valid' ? 'Tervalidasi Lolos QC' : 'Dalam Pengerjaan'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedStepView === 4 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CornerUpLeft className="w-3.5 h-3.5 text-indigo-400" />
                    4. Dikirim Kembali ke Dealer
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {/* Kontak Pengurus Ekspedisi hanya dapat dilihat oleh PDI Man */}
                    {user?.role === 'PDI Man' && waPengurus && (
                      <a
                        href={`https://wa.me/${cleanPhone(waPengurus)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat Pengurus Ekspedisi"
                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3 h-3" /> Pengurus
                      </a>
                    )}
                    {/* Kontak PDI Man hanya dapat dilihat oleh Repairmen */}
                    {user?.role === 'Repairmen' && claim.noHpPdi && (
                      <a
                        href={`https://wa.me/${cleanPhone(claim.noHpPdi)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat PDI Man"
                        className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3 h-3" /> PDI Man
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/70 mb-2.5">
                  Armada ekspedisi sedang dalam perjalanan mengantarkan part yang telah selesai diperbaiki ke Dealer Anda.
                </p>

                {/* Keterangan Part Sudah Divalidasi Hasil Perbaikan Disertai Checklist Hijau */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="leading-tight font-medium">
                    Part sudah divalidasi hasil perbaikan & lolos QC Main Dealer.
                  </span>
                </div>

                {/* Bagian Aksi Konfirmasi Serah Terima di Dealer */}
                {claim.status === 'Dikirim ke Dealer' && (
                  <div className="rounded-2xl border border-white/15 bg-black/40 p-3 space-y-2.5 shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Konfirmasi Kondisi Barang:</span>
                      <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30">
                        Tiba di Dealer
                      </span>
                    </div>

                    {/* Dua Tombol Aksi Utama: Terima & Retur */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Tombol Terima: Solid Menonjol Hijau */}
                      <button
                        type="button"
                        disabled={isSubmittingFinish}
                        onClick={handleKonfirmasiTerima}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-bold shadow-lg shadow-emerald-950/60 border border-emerald-400/50 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        {isSubmittingFinish ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        )}
                        <span>{isSubmittingFinish ? 'Memproses...' : 'Terima'}</span>
                      </button>

                      {/* Tombol Retur: Transparan / Redup Tidak Mencolok */}
                      <button
                        type="button"
                        onClick={() => setShowReturForm((prev) => !prev)}
                        className={`w-full py-2.5 px-3 rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-medium active:scale-[0.98] ${
                          showReturForm
                            ? 'bg-red-950/50 border-red-500/50 text-red-300'
                            : 'bg-transparent hover:bg-white/5 border-white/20 text-white/60 hover:text-white'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-white/50" />
                        <span>Retur</span>
                      </button>
                    </div>

                    {/* Kolom Input Teks Dinamis Alasan / Keterangan Retur */}
                    {showReturForm && (
                      <div className="pt-2.5 border-t border-white/10 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                        <label className="block text-[11px] font-semibold text-red-300">
                          Alasan / Keterangan Kenapa Barang Diretur:
                        </label>
                        <textarea
                          rows={2}
                          value={alasanRetur}
                          onChange={(e) => setAlasanRetur(e.target.value)}
                          placeholder="Jelaskan kondisi cacat fisik atau alasan part tidak sesuai..."
                          className="w-full p-2.5 rounded-xl bg-black/60 border border-red-500/40 text-xs text-white placeholder-white/40 focus:outline-none focus:border-red-400 transition-colors resize-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowReturForm(false);
                              setAlasanRetur('');
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleKirimRetur}
                            disabled={!alasanRetur.trim() || isSubmittingRetur}
                            className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            {isSubmittingRetur && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>Kirim Retur ke MD</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedStepView === 5 && (
              <div className="text-center py-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
                <h4 className="text-xs font-bold text-white">5. Klaim Ditutup (Selesai)</h4>
                <p className="text-xs text-white/70 mt-1">
                  Suku cadang telah diterima kembali oleh Dealer dan serah terima tuntas.
                </p>
              </div>
            )}
          </div>

          {/* Rincian Unit & Part Klaim */}
          <div>
            <h4 className="text-xs font-bold text-white/80 tracking-wide uppercase mb-2">
              Rincian Motor & Suku Cadang ({claim.items?.length || 0})
            </h4>

            <div className="space-y-2">
              {claim.items && claim.items.length > 0 ? (
                claim.items.map((item, idx) => {
                  const photoSrc = getCleanPhotoUrl(item.fotoPart);

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{item.tipe}</span>
                          <span className="text-[10px] text-white/60">({item.warna || '-'})</span>
                        </div>
                        <p className="text-xs font-semibold text-amber-300 truncate mt-0.5">
                          {item.namaPart}
                        </p>
                        <p className="text-[11px] text-white/70 mt-0.5">
                          Kerusakan: <span className="text-red-300 font-medium">{item.kerusakan || '-'}</span>
                          {item.penyebab && <span className="text-white/50"> ({item.penyebab})</span>}
                        </p>
                        {/* Tata Letak Nomor Fisik: No. Rangka tepat di bawah No. Mesin */}
                        <div className="text-[10px] font-mono text-white/50 mt-1 space-y-0.5">
                          <div>Mesin: <span className="text-white/75">{item.noMesin || '-'}</span></div>
                          <div>Rangka: <span className="text-white/75">{item.noRangka || '-'}</span></div>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-center">
                        {photoSrc ? (
                          <div
                            onClick={() => onPreviewPhoto(photoSrc, item.namaPart)}
                            className="group relative w-12 h-12 rounded-xl overflow-hidden border border-white/30 cursor-pointer shadow-md"
                          >
                            <img
                              src={photoSrc}
                              referrerPolicy="no-referrer"
                              alt={item.namaPart}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-white/40">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        <span className="text-[9px] text-white/40 block mt-0.5">
                          {photoSrc ? 'Lihat Foto' : 'No Foto'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-white/50 italic text-center py-2">Tidak ada data rincian part.</p>
              )}
            </div>
          </div>

          {/* Pengiriman & PJ Info Box */}
          <div className="rounded-2xl p-3 bg-black/25 border border-white/10 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-white/60">No. Surat Jalan:</span>
              <strong className="font-mono text-amber-300">{claim.noSj}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Sopir PJ Bongkar:</span>
              <span className="text-white">{claim.sopirPJ} ({claim.nopolPJ})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Metode Pengembalian:</span>
              <span className="font-bold text-white uppercase">{claim.metodeKembali}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 bg-black/40 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/15 hover:bg-white/20 active:scale-98 text-xs font-bold text-white transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
