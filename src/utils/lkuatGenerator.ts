import { ClaimItem, UserProfile } from '../types';

// Helper untuk membersihkan URL foto Google Drive menjadi direct link
export const getCleanPhotoUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:image')) return url;
  const match = url.match(/[-\w]{25,}/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[0]}`;
  return url;
};

// Helper untuk konversi URL foto menjadi Base64 (untuk jsPDF)
export const loadImgBase64 = (url: string): Promise<string> => {
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
export const ensureJsPdfLoaded = async (): Promise<any> => {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf;
  return new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src =
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = () => resolve((window as any).jspdf);
      s2.onerror = () => reject(new Error('Gagal memuat autoTable CDN'));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error('Gagal memuat jsPDF CDN'));
    document.head.appendChild(s1);
  });
};

/**
 * Generate dokumen jsPDF untuk LKUAT resmi standar MDC
 */
export const generateLkuatPdf = async (
  claim: ClaimItem,
  user?: UserProfile | null
): Promise<any> => {
  const jspdfModule = await ensureJsPdfLoaded();
  const { jsPDF } = jspdfModule;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const formattedTglPemeriksaan = (claim.tglPeriksa || claim.rawDate || claim.tgl || '').split(' ')[0];
  const formattedTglDo = (claim.tglDo || '').split(' ')[0];
  const namaDealer = claim.namaDealer || user?.namaDealer || 'Dealer Honda';
  const namaPemeriksaLengkap = user?.nama || claim.parafUser || 'PDI Man Dealer';
  const jenisPerbaikan = (claim.mdJenisPerbaikan && claim.mdJenisPerbaikan.trim()) ? claim.mdJenisPerbaikan.trim() : '-';
  const tglSelesaiVal =
    claim.tglSelesai || (claim.status === 'Selesai' ? (claim.rawDate || claim.tgl || '-') : '-');
  const timestampVerif = `${formattedTglPemeriksaan} 21:32`;

  // Evaluasi kondisi tanda tangan sesuai aturan:
  // 1. Diterima oleh Repairman: Hanya terisi jika sudah diterima repairman
  const isReceivedByRepairman = Boolean(
    (claim.mdValidasiRepairman && claim.mdValidasiRepairman.trim() !== '') ||
      ['Proses di MD', 'Dikirim ke Dealer', 'Selesai'].includes(claim.status)
  );

  // 2. Dibuat (QC MD) & Disetujui (Ka. Gudang): Hanya terisi jika approval sudah dilakukan
  const isApproved = Boolean(
    (claim.mdApprovalKaGudang && claim.mdApprovalKaGudang.toUpperCase().includes('SETUJU')) ||
      ['Dikirim ke Dealer', 'Selesai'].includes(claim.status)
  );

  // Preload gambar part secara asinkron
  const partImagesBase64 = await Promise.all(
    (claim.items || []).map(async (item) => {
      if (!item.fotoPart) return '';
      return await loadImgBase64(item.fotoPart);
    })
  );

  // Preload gambar paraf jika berupa gambar
  const sopirSignImg =
    claim.parafSopirPJ &&
    (claim.parafSopirPJ.startsWith('data:image') || claim.parafSopirPJ.startsWith('http'))
      ? await loadImgBase64(claim.parafSopirPJ)
      : '';
  const dealerSignImg =
    claim.parafUser &&
    (claim.parafUser.startsWith('data:image') || claim.parafUser.startsWith('http'))
      ? await loadImgBase64(claim.parafUser)
      : '';

  const marginX = 10;
  const printableWidth = 277;

  // 1. JUDUL DOKUMEN (Rata Kiri Sesuai Gambar Template Benar)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('LKUAT (Laporan Kondisi Unit Akibat Transportasi)', marginX, 12);

  // 2. BAGIAN ATAS (Kiri Info Identitas, Kanan 3 Tanda Tangan)
  const topBoxY = 15;
  const leftBoxWidth = 148;
  const rightBoxWidth = 126;
  const gapX = 3;
  const rightBoxX = marginX + leftBoxWidth + gapX; // 10 + 148 + 3 = 161
  const topBoxHeight = 36;

  // -- Kotak Kiri (Identitas Klaim / Dealer) --
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(marginX, topBoxY, leftBoxWidth, topBoxHeight);

  const infoRows = [
    ['NAMA DEALER', namaDealer],
    ['TGL DO AHM / MD', formattedTglDo],
    ['No. SJ / SPB', claim.noSj || ''],
    ['NAMA EKSPEDISI', claim.transporterPJ || '-'],
    ['NOMOR POLISI', claim.nopolPJ || '-'],
    ['NAMA SOPIR', claim.sopirPJ || '-'],
    ['TGL PEMERIKSAAN', formattedTglPemeriksaan],
    ['NAMA PEMERIKSA', namaPemeriksaLengkap],
  ];

  doc.setFontSize(7.5);
  let curInfoY = topBoxY + 4.2;
  infoRows.forEach((row) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(row[0], marginX + 2.5, curInfoY);
    doc.text(':', marginX + 44, curInfoY);
    doc.setFont('helvetica', 'normal');
    doc.text(row[1], marginX + 47, curInfoY);
    curInfoY += 4.2;
  });

  // -- Kotak Kanan (3 Kolom Tanda Tangan) --
  const colWidth = rightBoxWidth / 3; // 42mm

  // Helper menggambar cap merah MDC VERIFIED di dalam jsPDF
  const drawRedStamp = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    time: string,
    status: string
  ) => {
    doc.setDrawColor(220, 38, 38);
    doc.setFillColor(254, 242, 242);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(220, 38, 38);
    doc.text('MDC VERIFIED', x + w / 2, y + 3.2, { align: 'center' });

    doc.setFontSize(6.5);
    doc.setTextColor(185, 28, 28);
    doc.text(title, x + w / 2, y + 6.8, { align: 'center' });

    doc.setFont('courier', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139);
    doc.text(time, x + w / 2, y + 10, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(22, 163, 74);
    doc.text(status, x + w / 2, y + 13.5, { align: 'center' });
  };

  const signHeaders = ['MENGETAHUI', 'DIBUAT', 'Tanda Diterima oleh Repairman'];
  const signFooters = ['EKSPEDISI', 'DEALER', 'ADM. REPAIR'];

  for (let i = 0; i < 3; i++) {
    const cX = rightBoxX + i * colWidth;
    // Outer border kolom
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.rect(cX, topBoxY, colWidth, topBoxHeight);

    // Header kolom (abu terang)
    doc.setFillColor(241, 245, 249);
    doc.rect(cX, topBoxY, colWidth, 5.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 2 ? 6.5 : 7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(signHeaders[i], cX + colWidth / 2, topBoxY + 3.8, { align: 'center' });

    // Body kolom (area tanda tangan/cap)
    if (i === 0) {
      if (sopirSignImg) {
        doc.addImage(sopirSignImg, 'PNG', cX + 8, topBoxY + 9, 26, 17);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(claim.sopirPJ || '-', cX + colWidth / 2, topBoxY + 18, { align: 'center' });
      }
    } else if (i === 1) {
      if (dealerSignImg) {
        doc.addImage(dealerSignImg, 'PNG', cX + 8, topBoxY + 9, 26, 17);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text(namaPemeriksaLengkap, cX + colWidth / 2, topBoxY + 18, { align: 'center' });
      }
    } else if (i === 2) {
      // Hanya terisi jika sudah diterima repairman
      if (isReceivedByRepairman) {
        drawRedStamp(cX + 8.5, topBoxY + 8, 25, 15, 'TERIMA MD', timestampVerif, 'VALID SYSTEM');
        doc.setFont('courier', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(55, 65, 81);
        doc.text(timestampVerif, cX + colWidth / 2, topBoxY + 26.5, { align: 'center' });
      }
      // Jika belum diterima, kotak sengaja dibiarkan kosong bersih
    }

    // Footer kolom (solid hitam/navy)
    doc.setFillColor(15, 23, 42);
    doc.rect(cX, topBoxY + topBoxHeight - 5.5, colWidth, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(signFooters[i], cX + colWidth / 2, topBoxY + topBoxHeight - 1.8, { align: 'center' });
  }

  // 3. TABEL UTAMA: SUKU CADANG BERMASALAH (Header Gelap #0f172a, Teks Putih)
  const tableHeaders = [
    ['No', 'ILUSTRASI', 'PART BERMASALAH', 'GEJALA', 'PENYEBAB', 'No. ENGINE', 'No. FRAME', 'TIPE', 'PERBAIKAN DI MD'],
  ];

  const tableBody = (claim.items || []).map((item, idx) => [
    idx + 1,
    '', // Cell ilustrasi digambar di didDrawCell
    item.namaPart || '-',
    item.kerusakan || '-',
    item.penyebab || '-',
    item.noMesin || '-',
    item.noRangka || '-',
    item.tipe || '-',
    jenisPerbaikan,
  ]);

  doc.autoTable({
    startY: 53,
    head: tableHeaders,
    body: tableBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      valign: 'middle',
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      textColor: [0, 0, 0],
      minCellHeight: 15,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 26 },
      2: { cellWidth: 44, fontStyle: 'bold' },
      3: { cellWidth: 35 },
      4: { cellWidth: 35 },
      5: { cellWidth: 36, font: 'courier', halign: 'center' },
      6: { cellWidth: 38, font: 'courier', halign: 'center' },
      7: { halign: 'center', cellWidth: 24 },
      8: { halign: 'center', cellWidth: 29 },
    },
    margin: { left: marginX, right: marginX },
    didDrawCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 1) {
        const imgData = partImagesBase64[data.row.index];
        if (imgData) {
          const cellX = data.cell.x + 2;
          const cellY = data.cell.y + 1.5;
          const cellW = data.cell.width - 4;
          const cellH = data.cell.height - 3;
          try {
            doc.addImage(imgData, 'JPEG', cellX, cellY, cellW, cellH);
          } catch (_) {
            doc.setFontSize(6.5);
            doc.setTextColor(148, 163, 184);
            doc.text(
              '[Foto]',
              data.cell.x + data.cell.width / 2,
              data.cell.y + data.cell.height / 2,
              { align: 'center' }
            );
          }
        } else {
          doc.setFontSize(6.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            '[No Foto]',
            data.cell.x + data.cell.width / 2,
            data.cell.y + data.cell.height / 2 + 1,
            { align: 'center' }
          );
        }
      }
    },
  });

  let adminY = (doc as any).lastAutoTable.finalY + 3;

  // 4. BAGIAN PENGAJUAN KLAIM ADMIN MD (Kiri Box Pengajuan, Kanan 2 Tanda Tangan)
  const adminLeftW = 176;
  const adminRightW = 98;
  const adminGapX = 3;
  const adminRightX = marginX + adminLeftW + adminGapX; // 10 + 176 + 3 = 189
  const adminBoxHeight = 24;

  // -- Kotak Kiri (Pengajuan Klaim) --
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(marginX, adminY, adminLeftW, adminBoxHeight);

  // Header abu
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, adminY, adminLeftW, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PENGAJUAN KLAIM (DIISI OLEH PETUGAS KLAIM ADMIN MAIN DEALER)', marginX + 3, adminY + 3.5);

  // Isi pengajuan klaim
  doc.setFontSize(7.5);
  let curAdminRowY = adminY + 8.8;
  const adminRows = [
    ['TGL PENGAJUAN KLAIM', formattedTglPemeriksaan],
    ['JENIS PERBAIKAN', jenisPerbaikan],
    ['KEPUTUSAN', claim.status === 'Ditolak' ? 'Ditolak' : 'Diterima'],
    ['ALASAN DITOLAK', '-'],
  ];
  adminRows.forEach((row) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(row[0], marginX + 3, curAdminRowY);
    doc.text(':', marginX + 44, curAdminRowY);
    doc.setFont('helvetica', 'normal');
    doc.text(row[1], marginX + 47, curAdminRowY);
    curAdminRowY += 4.2;
  });

  // -- Kotak Kanan (Dibuat & Disetujui) --
  const adminColW = adminRightW / 2; // 49mm
  const adminSignHeaders = ['DIBUAT', 'DISETUJUI'];
  const adminSignFooters = ['Klaim Admin', 'Ka Gudang'];
  const adminSignRoles = ['QC MD KLAIM', 'KA. GUDANG'];

  for (let j = 0; j < 2; j++) {
    const ax = adminRightX + j * adminColW;
    doc.setDrawColor(203, 213, 225);
    doc.rect(ax, adminY, adminColW, adminBoxHeight);

    // Header abu
    doc.setFillColor(241, 245, 249);
    doc.rect(ax, adminY, adminColW, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(adminSignHeaders[j], ax + adminColW / 2, adminY + 3.5, { align: 'center' });

    // Hanya isi cap merah verifikasi jika approval sudah dilakukan
    if (isApproved) {
      drawRedStamp(ax + 12, adminY + 6.5, 25, 13, adminSignRoles[j], timestampVerif, 'VALID');
    }
    // Jika belum approval, kotak dibiarkan kosong bersih

    // Footer bar solid gelap dengan teks jabatan
    const footBarH = 4.5;
    doc.setFillColor(15, 23, 42);
    doc.rect(ax, adminY + adminBoxHeight - footBarH, adminColW, footBarH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(adminSignFooters[j], ax + adminColW / 2, adminY + adminBoxHeight - 1.3, { align: 'center' });
  }

  // 5. KOTAK BAWAH SELESAI FULL WIDTH
  const bottomY = adminY + adminBoxHeight + 2.5;
  const bottomH = 13.5;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, bottomY, printableWidth, bottomH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('DIISI OLEH PETUGAS KLAIM ADMIN MAIN DEALER JIKA KLAIM SUDAH SELESAI', marginX + 3, bottomY + 3.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`TANGGAL SELESAI       : ${tglSelesaiVal}`, marginX + 3, bottomY + 7.6);
  doc.text(`KELENGKAPAN DOKUMEN : ${claim.idKlaim} (No. SJ: ${claim.noSj})`, marginX + 3, bottomY + 11.4);

  return doc;
};

/**
 * Generate Blob PDF LKUAT
 */
export const generateLkuatPdfBlob = async (
  claim: ClaimItem,
  user?: UserProfile | null
): Promise<Blob> => {
  const doc = await generateLkuatPdf(claim, user);
  return doc.output('blob');
};

/**
 * Dapatkan nama file standar LKUAT dengan format LKUAT_{KODE_DEALER}_{TANGGAL_PEMERIKSAAN}_{ID_KLAIM}.pdf
 */
export const getLkuatPdfFilename = (
  claim: ClaimItem,
  user?: UserProfile | null
): string => {
  const rawTgl = (claim.tglPeriksa || claim.rawDate || claim.tgl || '').split(' ')[0] || 'TGL';
  const formattedTgl = rawTgl.replace(/[/\\:.]/g, '-');
  const kodeHurufDealer =
    claim.kodeDealer || user?.kodeDealer || claim.kodeAhm || user?.kodeAhm || 'DEALER';
  const idKlaim = claim.idKlaim || `CLM-${claim.noSj || Date.now()}`;
  const cleanIdKlaim = idKlaim.replace(/[/\\?%*:|"<>]/g, '-');
  return `LKUAT_${kodeHurufDealer}_${formattedTgl}_${cleanIdKlaim}.pdf`;
};
