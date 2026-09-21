import { ClaimItem, DashboardStats, UserProfile } from '../types';

export const getPersistedDealerClaims = (_user: UserProfile): ClaimItem[] => {
  // Pure state: tidak lagi membaca localStorage agar Spreadsheet menjadi Single Source of Truth
  return [];
};

export const savePersistedDealerClaims = (kodeAhm: string, _claims: ClaimItem[]) => {
  // Bersihkan cache lama jika ada
  try {
    const storageKey = `mdc_claims_${kodeAhm || 'DEFAULT'}`;
    localStorage.removeItem(storageKey);
  } catch (_) {}
};

export const calculateDashboardStats = (claimsList: ClaimItem[]): DashboardStats => {
  let draft = 0;
  let kirimMD = 0;
  let prosesMD = 0;
  let kirimDealer = 0;
  let selesai = 0;

  claimsList.forEach((c) => {
    const s = (c.status || '').toLowerCase();
    if (s === 'draft' || s.includes('draft')) {
      draft++;
    } else if (s.includes('dikirim ke md') || s.includes('kirim md')) {
      kirimMD++;
    } else if (s.includes('proses di md') || s.includes('proses md')) {
      prosesMD++;
    } else if (s.includes('dikirim ke dealer') || s.includes('kirim ke dealer')) {
      kirimDealer++;
    } else if (s.includes('selesai')) {
      selesai++;
    }
  });

  return {
    draft,
    kirimMD,
    prosesMD,
    kirimDealer,
    selesai,
    alertDraft: draft > 0,
  };
};

export const generateDefaultDealerClaims = (user: UserProfile): ClaimItem[] => {
  const kode = user.kodeAhm || '12345';
  const namaDealer = user.namaDealer || 'Dealer Resmi Honda';

  return [
    {
      idKlaim: `CLM-${kode}-240901`,
      rawTimestamp: Date.now() - 3600000 * 18,
      rawDate: '2026-09-12',
      tgl: '12 Sep 2026 10:15 WIB',
      tglSelesai: '',
      status: 'Dikirim ke MD',
      noSj: 'SJ/AOP/2026/09/8812',
      tglDo: '2026-09-11',
      tglPeriksa: '2026-09-12',
      kodeAhm: kode,
      namaDealer: namaDealer,
      sopirPJ: 'Budi Santoso',
      nopolPJ: 'B 9214 UZX',
      transporterPJ: 'PT. PUNINAR LOGISTICS',
      parafSopirPJ: 'BudiS',
      metodeKembali: 'DIKIRIM LANGSUNG',
      sopirKembali: 'Budi Santoso',
      nopolKembali: 'B 9214 UZX',
      transporterKembali: 'PT. PUNINAR LOGISTICS',
      parafUser: user.nama || 'PDI Man',
      draftDeadline: '',
      kontakPengurusPJ: '081288990011',
      kontakPengurusKembali: '081288990011',
      kontakRepairman: '081399887766',
      kontakKaGudang: '081122334455',
      noHpPdi: user.noHp || '08123456789',
      mdJenisPerbaikan: 'Ganti Part Baru',
      mdTargetSelesai: '15 Sep 2026',
      mdValidasiRepairman: 'VALID',
      mdApprovalKaGudang: 'DISETUJUI',
      isUrgent: false,
      items: [
        {
          indexMotor: 1,
          tipe: 'Honda Vario 160 ABS',
          warna: 'Hitam Doff',
          noMesin: 'KF11E101892',
          noRangka: 'MH1KF1123PK01892',
          namaPart: 'Cover Body Belakang Kanan',
          kerusakan: 'Goresan Dalam Akibat Benturan Pengikat Truk',
          penyebab: 'Benturan saat transportasi ekspedisi',
          fotoPart: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop&q=80',
        },
        {
          indexMotor: 1,
          tipe: 'Honda Vario 160 ABS',
          warna: 'Hitam Doff',
          noMesin: 'KF11E101892',
          noRangka: 'MH1KF1123PK01892',
          namaPart: 'Kaca Spion Kanan',
          kerusakan: 'Pecah / Retak Rambut',
          penyebab: 'Tertindih kargo ekspedisi',
          fotoPart: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      idKlaim: `CLM-${kode}-240902`,
      rawTimestamp: Date.now() - 3600000 * 42,
      rawDate: '2026-09-11',
      tgl: '11 Sep 2026 14:30 WIB',
      tglSelesai: '',
      status: 'Proses di MD',
      noSj: 'SJ/AOP/2026/09/8745',
      tglDo: '2026-09-10',
      tglPeriksa: '2026-09-11',
      kodeAhm: kode,
      namaDealer: namaDealer,
      sopirPJ: 'Hendra Gunawan',
      nopolPJ: 'B 9043 TXY',
      transporterPJ: 'PT. SERASI AUTORAYA',
      parafSopirPJ: 'HendraG',
      metodeKembali: 'DITITIP',
      sopirKembali: 'Agus Salim',
      nopolKembali: 'B 9341 UWX',
      transporterKembali: 'PT. PUNINAR LOGISTICS',
      parafUser: user.nama || 'PDI Man',
      draftDeadline: '',
      kontakPengurusPJ: '081277665544',
      kontakPengurusKembali: '081288990011',
      kontakRepairman: '081399887766',
      kontakKaGudang: '081122334455',
      noHpPdi: user.noHp || '08123456789',
      mdJenisPerbaikan: 'Pengecatan Ulang / Repaint',
      mdTargetSelesai: '14 Sep 2026',
      mdValidasiRepairman: 'DALAM PROSES REPAIR',
      mdApprovalKaGudang: 'DISETUJUI',
      isUrgent: true,
      items: [
        {
          indexMotor: 1,
          tipe: 'Honda PCX 160 CBS',
          warna: 'Putih Mutiara',
          noMesin: 'KF21E104128',
          noRangka: 'MH1KF2115PK04128',
          namaPart: 'Front Fender / Spakbor Depan',
          kerusakan: 'Cat Mengelupas & Retak Dudukan Baut',
          penyebab: 'Gesekan penutup terpal ekspedisi',
          fotoPart: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      idKlaim: `CLM-${kode}-240903`,
      rawTimestamp: Date.now() - 3600000 * 70,
      rawDate: '2026-09-10',
      tgl: '10 Sep 2026 09:20 WIB',
      tglSelesai: '',
      status: 'Dikirim ke Dealer',
      noSj: 'SJ/AOP/2026/09/8610',
      tglDo: '2026-09-09',
      tglPeriksa: '2026-09-10',
      kodeAhm: kode,
      namaDealer: namaDealer,
      sopirPJ: 'Agus Supratman',
      nopolPJ: 'B 9871 WQ',
      transporterPJ: 'PT. DUNIA EXPRESS',
      parafSopirPJ: 'AgusS',
      metodeKembali: 'DIKIRIM LANGSUNG',
      sopirKembali: 'Agus Supratman',
      nopolKembali: 'B 9871 WQ',
      transporterKembali: 'PT. DUNIA EXPRESS',
      parafUser: user.nama || 'PDI Man',
      draftDeadline: '',
      kontakPengurusPJ: '081299001122',
      kontakPengurusKembali: '081299001122',
      kontakRepairman: '081399887766',
      kontakKaGudang: '081122334455',
      noHpPdi: user.noHp || '08123456789',
      mdJenisPerbaikan: 'Selesai Ganti Part Baru',
      mdTargetSelesai: '12 Sep 2026',
      mdValidasiRepairman: 'SELESAI QC PASSED',
      mdApprovalKaGudang: 'DISETUJUI KIRIM BALIK',
      mdSopirBalik: 'Slamet Riyadi',
      mdNopolBalik: 'B 9112 PZX',
      mdTransporterBalik: 'PT. PUNINAR LOGISTICS',
      isUrgent: false,
      items: [
        {
          indexMotor: 1,
          tipe: 'Honda BeAT Street',
          warna: 'Street Black',
          noMesin: 'JM81E108921',
          noRangka: 'MH1JM8119PK08921',
          namaPart: 'Speedometer Digital LCD',
          kerusakan: 'Layar Tergores Dalam & Retak',
          penyebab: 'Benturan material keras saat loading',
          fotoPart: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      idKlaim: `CLM-${kode}-240904`,
      rawTimestamp: Date.now() - 3600000 * 120,
      rawDate: '2026-09-08',
      tgl: '08 Sep 2026 11:00 WIB',
      tglSelesai: '12 Sep 2026 15:45 WIB',
      status: 'Selesai',
      noSj: 'SJ/AOP/2026/09/8390',
      tglDo: '2026-09-07',
      tglPeriksa: '2026-09-08',
      kodeAhm: kode,
      namaDealer: namaDealer,
      sopirPJ: 'Ahmad Dahlan',
      nopolPJ: 'B 9302 PQR',
      transporterPJ: 'PT. PUNINAR LOGISTICS',
      parafSopirPJ: 'AhmadD',
      metodeKembali: 'DIKIRIM LANGSUNG',
      sopirKembali: 'Ahmad Dahlan',
      nopolKembali: 'B 9302 PQR',
      transporterKembali: 'PT. PUNINAR LOGISTICS',
      parafUser: user.nama || 'PDI Man',
      draftDeadline: '',
      kontakPengurusPJ: '081288990011',
      kontakPengurusKembali: '081288990011',
      kontakRepairman: '081399887766',
      kontakKaGudang: '081122334455',
      noHpPdi: user.noHp || '08123456789',
      mdJenisPerbaikan: 'Selesai Ganti Part Baru & Terpasang',
      mdTargetSelesai: '11 Sep 2026',
      mdValidasiRepairman: 'QC PASSED',
      mdApprovalKaGudang: 'DISETUJUI',
      isUrgent: false,
      items: [
        {
          indexMotor: 1,
          tipe: 'Honda Scoopy Prestige',
          warna: 'Prestige Green',
          noMesin: 'JM31E105432',
          noRangka: 'MH1JM3120PK05432',
          namaPart: 'Emblem 3D Scoopy Kiri',
          kerusakan: 'Patah & Terkelupas',
          penyebab: 'Terkena pengait tali tambang saat bongkar',
          fotoPart: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
    {
      idKlaim: `CLM-${kode}-240905`,
      rawTimestamp: Date.now() - 3600000 * 4,
      rawDate: '2026-09-13',
      tgl: '13 Sep 2026 08:30 WIB',
      tglSelesai: '',
      status: 'Draft',
      noSj: 'SJ/AOP/2026/09/8991',
      tglDo: '2026-09-12',
      tglPeriksa: '2026-09-13',
      kodeAhm: kode,
      namaDealer: namaDealer,
      sopirPJ: 'Rahmat Hidayat',
      nopolPJ: 'B 9554 KMN',
      transporterPJ: 'PT. SERASI AUTORAYA',
      parafSopirPJ: 'RahmatH',
      metodeKembali: 'DITITIP',
      sopirKembali: '',
      nopolKembali: '',
      transporterKembali: '',
      parafUser: user.nama || 'PDI Man',
      draftDeadline: new Date(Date.now() + 3600000 * 20).toISOString(),
      kontakPengurusPJ: '081277665544',
      kontakPengurusKembali: '',
      kontakRepairman: '',
      kontakKaGudang: '',
      noHpPdi: user.noHp || '08123456789',
      isUrgent: false,
      items: [
        {
          indexMotor: 1,
          tipe: 'Honda ADV 160 CBS',
          warna: 'Dynamic Red',
          noMesin: 'KF31E102901',
          noRangka: 'MH1KF3112PK02901',
          namaPart: 'Windshield / Visor Depan',
          kerusakan: 'Goresan Gesekan Terpal',
          penyebab: 'Gesekan saat perjalanan cuaca hujan',
          fotoPart: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&auto=format&fit=crop&q=80',
        },
      ],
    },
  ];
};
