import fs from 'fs';
import path from 'path';

export const SPREADSHEET_ID = '1Xy9095taEr4EQC7dWqOj_nPjaIDNsxyf6k6eN7Tb3Mc';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'spreadsheet_database.json');

export interface MasterDealer {
  kodeAhm: string;
  namaDealer: string;
  kodeDealer: string;
  kategori: string;
  kota: string;
  sentraDistribusi: string;
}

export interface UserMobile {
  timestamp: string;
  email: string;
  namaLengkap: string;
  noHp: string;
  kodeAhm: string;
  namaDealer: string;
  kodeDealer: string;
  kategori: string;
  kota: string;
  sentraDistribusi: string;
  role: string;
}

export interface StoredClaimHeader {
  idKlaim: string;
  timestamp: string;
  status: string;
  lastStep?: number;
  noSj: string;
  tglDo: string;
  tglPeriksa: string;
  kodeAhm: string;
  namaDealer: string;
  sopirPJ: string;
  nopolPJ: string;
  transporterPJ: string;
  parafSopirPJ?: string;
  fotoSopirPJ?: string; // << TAMBAHKAN KE INTERFACE
  metodeKembali: string;
  sopirKembali: string;
  nopolKembali: string;
  transporterKembali: string;
  parafUser?: string;
  draftDeadline: string;
  mdStatusPenerimaan?: string;
  mdJenisPerbaikan?: string;
  mdTargetSelesai?: string;
  mdApprovalKaGudang?: string;
  mdValidasiRepairman?: string;
  mdSopirBalik?: string;
  mdNopolBalik?: string;
  mdTransporterBalik?: string;
  tglSelesaiDealer?: string;
  mdKomentarSLA?: string;
  isUrgent?: string;
}

export interface StoredClaimDetail {
  idDetail: string;
  idKlaim: string;
  indexMotor: number;
  tipeMotor: string;
  warna: string;
  noMesin: string;
  noRangka: string;
  namaPart: string;
  jenisKerusakan: string;
  penyebab: string;
  fotoPart?: string;
}

export interface DatabaseSchema {
  spreadsheetId: string;
  lastUpdated: string;
  masterDealer: MasterDealer[];
  userMobile: UserMobile[];
  klaimHeader: StoredClaimHeader[];
  klaimDetail: StoredClaimDetail[];
  masterTransporter: Array<{ transporter: string; nopol: string; kontak: string }>;
  masterMotor: Array<{ jenisMotor?: string; tipeMotor: string; warna: string; namaWarna: string }>;
  masterPart: Array<{ tipeMotor: string; namaPart: string }>;
  masterKerusakan: string[];
  masterPenyebab: string[];
}

const DEFAULT_DEALERS: MasterDealer[] = [
  {
    kodeAhm: '01234',
    namaDealer: 'PT. Daya Adicipta Motora - Cimahi',
    kodeDealer: 'DLR-01234',
    kategori: 'H1-H2-H3',
    kota: 'Kota Cimahi',
    sentraDistribusi: 'BAROS',
  },
  {
    kodeAhm: '05678',
    namaDealer: 'PT. Astra Motor - Bandung',
    kodeDealer: 'DLR-05678',
    kategori: 'Wing',
    kota: 'Kota Bandung',
    sentraDistribusi: 'BANDUNG',
  },
  {
    kodeAhm: '00112',
    namaDealer: 'PT. Tunas Dwipa Matra - Karawang',
    kodeDealer: 'DLR-00112',
    kategori: 'H1-H2-H3',
    kota: 'Kab. Karawang',
    sentraDistribusi: 'KARAWANG',
  },
  {
    kodeAhm: '02345',
    namaDealer: 'PT. Nusantara Sakti - Cirebon',
    kodeDealer: 'DLR-02345',
    kategori: 'H1-H2-H3',
    kota: 'Kota Cirebon',
    sentraDistribusi: 'CIREBON',
  },
  {
    kodeAhm: '03456',
    namaDealer: 'PT. Bintang Motor Jaya - Bogor',
    kodeDealer: 'DLR-03456',
    kategori: 'Wing',
    kota: 'Kab. Bogor',
    sentraDistribusi: 'BAROS',
  },
  {
    kodeAhm: '07890',
    namaDealer: 'PT. Daya Adicipta Sandika - Bekasi',
    kodeDealer: 'DLR-07890',
    kategori: 'BigWing',
    kota: 'Kota Bekasi',
    sentraDistribusi: 'KARAWANG',
  },
];

const DEFAULT_USERS: UserMobile[] = [
  {
    timestamp: '2026-09-01T08:00:00.000Z',
    email: 'pdi.cimahi@honda.co.id',
    namaLengkap: 'BUDI PRASETYO',
    noHp: '081234567890',
    kodeAhm: '01234',
    namaDealer: 'PT. Daya Adicipta Motora - Cimahi',
    kodeDealer: 'DLR-01234',
    kategori: 'H1-H2-H3',
    kota: 'Kota Cimahi',
    sentraDistribusi: 'BAROS',
    role: 'PDI Man',
  },
  {
    timestamp: '2026-09-01T08:30:00.000Z',
    email: 'pdi.bandung@honda.co.id',
    namaLengkap: 'AGUS HERMAWAN',
    noHp: '081398765432',
    kodeAhm: '05678',
    namaDealer: 'PT. Astra Motor - Bandung',
    kodeDealer: 'DLR-05678',
    kategori: 'Wing',
    kota: 'Kota Bandung',
    sentraDistribusi: 'BANDUNG',
    role: 'PDI Man',
  },
];

const DEFAULT_CLAIMS_HEADER: StoredClaimHeader[] = [];

const DEFAULT_CLAIMS_DETAIL: StoredClaimDetail[] = [];

const DEFAULT_TRANSPORTERS = [
  { transporter: 'PT. PUNINAR LOGISTICS', nopol: 'B 9214 UZX', kontak: '081288990011' },
  { transporter: 'PT. WINDU SAKTI SENTOSA', nopol: 'D 8099 AF', kontak: '081288990022' },
  { transporter: 'PT. WINDU SAKTI SENTOSA', nopol: 'D 8841 AB', kontak: '081288990033' },
  { transporter: 'PT. TIRA MITRA TRANSPORT', nopol: 'B 9042 KXS', kontak: '081288990044' },
  { transporter: 'PT. RATU JASA TRANS MANDIRI', nopol: 'E 9122 YC', kontak: '081288990055' },
];

const DEFAULT_MOTORS: Array<{ tipeMotor: string; warna: string; namaWarna: string }> = [];
const DEFAULT_PARTS: Array<{ tipeMotor: string; namaPart: string }> = [];
const DEFAULT_KERUSAKAN: string[] = [];
const DEFAULT_PENYEBAB: string[] = [];

function initDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.masterDealer && parsed.klaimHeader) {
        return parsed;
      }
    } catch (_) {}
  }

  const initialDb: DatabaseSchema = {
    spreadsheetId: SPREADSHEET_ID,
    lastUpdated: new Date().toISOString(),
    masterDealer: DEFAULT_DEALERS,
    userMobile: DEFAULT_USERS,
    klaimHeader: DEFAULT_CLAIMS_HEADER,
    klaimDetail: DEFAULT_CLAIMS_DETAIL,
    masterTransporter: DEFAULT_TRANSPORTERS,
    masterMotor: DEFAULT_MOTORS,
    masterPart: DEFAULT_PARTS,
    masterKerusakan: DEFAULT_KERUSAKAN,
    masterPenyebab: DEFAULT_PENYEBAB,
  };

  saveDb(initialDb);
  return initialDb;
}

function saveDb(db: DatabaseSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[SpreadsheetDB] Gagal menulis ke file db:', err);
  }
}

// Clean Kode AHM (removes spaces, leading zeros normalization if needed)
function cleanKodeAhm(val: any): string {
  if (!val) return '';
  return String(val).trim();
}

// --- HELPER NORMALISASI KODE AHM (LEAP-PROOF ZERO PADDING) ---
export function normalizeCode(val: any): { raw: string; noZero: string; padded: string } {
  if (val === null || val === undefined) return { raw: '', noZero: '', padded: '' };
  const raw = String(val).replace(/['"\s]/g, '').trim().toUpperCase();
  const noZero = raw.replace(/^0+/, '');
  const padded = noZero.length > 0 && noZero.length <= 5 ? noZero.padStart(5, '0') : raw;
  return { raw, noZero, padded };
}

export function isCodeMatch(code1: any, code2: any): boolean {
  const c1 = normalizeCode(code1);
  const c2 = normalizeCode(code2);
  if (!c1.raw || !c2.raw) return false;
  return (
    c1.raw === c2.raw ||
    (c1.noZero !== '' && c1.noZero === c2.noZero) ||
    (c1.padded !== '' && c1.padded === c2.padded)
  );
}

export const SpreadsheetDatabase = {
  upsertDealer(dealer: {
    kodeAhm: string;
    namaDealer: string;
    kodeDealer?: string;
    kategori?: string;
    kota?: string;
    sentraDistribusi?: string;
    role?: string;
  }) {
    if (!dealer || !dealer.kodeAhm) return;
    const db = initDb();
    const cleanKode = normalizeCode(dealer.kodeAhm).raw || dealer.kodeAhm;
    const existingIndex = db.masterDealer.findIndex((d) => isCodeMatch(d.kodeAhm, cleanKode));
    const newEntry = {
      kodeAhm: dealer.kodeAhm,
      namaDealer: dealer.namaDealer,
      kodeDealer: dealer.kodeDealer || `DLR-${cleanKode}`,
      kategori: dealer.kategori || 'Reguler',
      kota: dealer.kota || 'Jawa Barat',
      sentraDistribusi: dealer.sentraDistribusi || 'BANDUNG',
    };
    if (existingIndex >= 0) {
      db.masterDealer[existingIndex] = { ...db.masterDealer[existingIndex], ...newEntry };
    } else {
      db.masterDealer.push(newEntry);
    }
    saveDb(db);
  },

  updateMasterData(data: {
    transporterList?: any[];
    motorList?: any[];
    partList?: any[];
  }) {
    if (!data) return;
    const db = initDb();
    if (Array.isArray(data.transporterList) && data.transporterList.length > 0) {
      db.masterTransporter = data.transporterList;
    }
    if (Array.isArray(data.motorList) && data.motorList.length > 0) {
      db.masterMotor = data.motorList;
    }
    if (Array.isArray(data.partList) && data.partList.length > 0) {
      db.masterPart = data.partList;
    }
    saveDb(db);
  },

  // 1. Lookup Kode AHM in Master_Dealer
  lookupKodeAhm(inputKode: string) {
    const db = initDb();
    const query = normalizeCode(inputKode);
    if (!query.raw) return { found: false };

    const dealer = db.masterDealer.find((d) => {
      // Cocokkan Kode AHM dengan toleransi leading zero
      const matchAhm = isCodeMatch(d.kodeAhm, inputKode);
      
      // Cocokkan jika user memasukkan Kode Dealer (misal DLR-01234 atau 01234)
      const cleanKodeDealer = String(d.kodeDealer || '').replace(/['"\s]/g, '').trim().toUpperCase();
      const matchDealerCode =
        cleanKodeDealer === query.raw ||
        cleanKodeDealer.replace(/^DLR-?/i, '') === query.noZero;

      return matchAhm || matchDealerCode;
    });

    if (dealer) {
      return {
        found: true,
        kodeAhm: dealer.kodeAhm, // Mengembalikan format resmi dari database
        namaDealer: dealer.namaDealer,
        kodeDealer: dealer.kodeDealer,
        kategori: dealer.kategori,
        kota: dealer.kota,
        sentraDistribusi: dealer.sentraDistribusi,
        role: 'PDI Man',
      };
    }
    return { found: false };
  },

  // 2. Register PDI User to User_Mobile
  registerUser(formData: {
    email: string;
    namaLengkap: string;
    noHp: string;
    kodeAhm: string;
    namaDealer: string;
    kodeDealer: string;
    kategori: string;
    kota: string;
    sentraDistribusi: string;
    role?: string;
  }) {
    const db = initDb();
    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanKode = normalizeCode(formData.kodeAhm).padded || formData.kodeAhm.trim();

    // Verifikasi Kode AHM di Master_Dealer
    let dealer = db.masterDealer.find((d) => isCodeMatch(d.kodeAhm, cleanKode));
    if (!dealer) {
      dealer = {
        kodeAhm: cleanKode,
        namaDealer: formData.namaDealer || `Dealer Honda (${cleanKode})`,
        kodeDealer: formData.kodeDealer || `DLR-${cleanKode}`,
        kategori: formData.kategori || 'H1-H2-H3',
        kota: formData.kota || 'Jawa Barat',
        sentraDistribusi: formData.sentraDistribusi || 'BAROS',
      };
      db.masterDealer.push(dealer);
    }

    const existingIndex = db.userMobile.findIndex((u) => u.email.toLowerCase() === cleanEmail);
    const newUserRecord: UserMobile = {
      timestamp: new Date().toISOString(),
      email: cleanEmail,
      namaLengkap: formData.namaLengkap.toUpperCase(),
      noHp: formData.noHp,
      kodeAhm: dealer.kodeAhm,
      namaDealer: dealer.namaDealer,
      kodeDealer: dealer.kodeDealer,
      kategori: dealer.kategori,
      kota: dealer.kota,
      sentraDistribusi: dealer.sentraDistribusi,
      role: formData.role || 'PDI Man',
    };

    if (existingIndex >= 0) {
      db.userMobile[existingIndex] = newUserRecord;
    } else {
      db.userMobile.push(newUserRecord);
    }

    saveDb(db);
    return { success: true, message: 'Pendaftaran akun PDI Man berhasil disimpan.' };
  },

  // 3. Login User
  loginUser(email: string, kodeAhm: string) {
    const db = initDb();
    const cleanEmail = email.trim().toLowerCase();

    // Cek di User_Mobile dengan pencocokan fleksibel
    const user = db.userMobile.find(
      (u) => u.email.toLowerCase() === cleanEmail && isCodeMatch(u.kodeAhm, kodeAhm)
    );

    if (user) {
      return {
        status: 'SUCCESS',
        user: {
          email: user.email,
          nama: user.namaLengkap,
          noHp: user.noHp,
          kodeAhm: user.kodeAhm,
          namaDealer: user.namaDealer,
          kodeDealer: user.kodeDealer,
          kategori: user.kategori,
          kota: user.kota,
          sentraDistribusi: user.sentraDistribusi,
          role: user.role,
        },
      };
    }

    // Cek apakah email terdaftar tetapi Kode AHM salah
    const emailExists = db.userMobile.some((u) => u.email.toLowerCase() === cleanEmail);
    if (emailExists) {
      return {
        status: 'FAILED',
        message: 'Kode AHM tidak cocok dengan data pendaftaran akun Anda di Users_Mobile.',
      };
    }

    return {
      status: 'FAILED',
      message: 'Alamat email belum terdaftar di Users_Mobile spreadsheet.',
    };
  },

  // 4. Get Master Data
  getMasterDataKlaim() {
    const db = initDb();
    return {
      success: true,
      transporterList: db.masterTransporter || [],
      motorList: (db.masterMotor || []).map((m: any) => ({
        jenisMotor: m.jenisMotor || m.jenis || '',
        tipe: m.tipe || m.tipeMotor || '',
        warna: m.warna || '',
        namaWarna: m.namaWarna || '',
      })),
      partList: (db.masterPart || []).map((p: any) => ({
        tipe: p.tipe || p.tipeMotor || '',
        namaPart: p.namaPart || '',
      })),
      kerusakanList: db.masterKerusakan || [],
      penyebabList: db.masterPenyebab || [],
    };
  },

  // 4b. Save Master Data (Persist data fetched from Google Spreadsheet to local DB)
  saveMasterData(data: {
    transporterList?: any[];
    motorList?: any[];
    partList?: any[];
    kerusakanList?: string[];
    penyebabList?: string[];
  }) {
    const db = initDb();
    if (Array.isArray(data.transporterList) && data.transporterList.length > 0) {
      db.masterTransporter = data.transporterList.map((t: any) => ({
        transporter: t.transporter || '',
        nopol: (t.nopol || '').toUpperCase().trim(),
        kontak: t.kontak || '',
      }));
    }
    if (Array.isArray(data.motorList) && data.motorList.length > 0) {
      db.masterMotor = data.motorList.map((m: any) => ({
        jenisMotor: m.jenisMotor || m.jenis || '',
        tipeMotor: (m.tipe || m.tipeMotor || '').toUpperCase().trim(),
        warna: (m.warna || '').toUpperCase().trim(),
        namaWarna: m.namaWarna || '',
      }));
    }
    if (Array.isArray(data.partList) && data.partList.length > 0) {
      db.masterPart = data.partList.map((p: any) => ({
        tipeMotor: (p.tipe || p.tipeMotor || '').toUpperCase().trim(),
        namaPart: p.namaPart || '',
      }));
    }
    if (Array.isArray(data.kerusakanList) && data.kerusakanList.length > 0) {
      db.masterKerusakan = data.kerusakanList;
    }
    if (Array.isArray(data.penyebabList) && data.penyebabList.length > 0) {
      db.masterPenyebab = data.penyebabList;
    }
    saveDb(db);
  },

  // 5. Get Recent Claims Filtered by Kode AHM
  getRecentClaims(kodeAhm: string) {
    const db = initDb();
    const matchingHeaders = db.klaimHeader.filter((h) => isCodeMatch(h.kodeAhm, kodeAhm));

    const fullClaims = matchingHeaders.map((h) => {
      const items = db.klaimDetail
        .filter((d) => d.idKlaim === h.idKlaim)
        .map((d) => ({
          indexMotor: d.indexMotor,
          tipe: d.tipeMotor,
          warna: d.warna,
          noMesin: d.noMesin.replace(/^'/, ''),
          noRangka: d.noRangka.replace(/^'/, ''),
          namaPart: d.namaPart,
          kerusakan: d.jenisKerusakan,
          penyebab: d.penyebab,
          fotoPart: d.fotoPart || '',
        }));

      const dateObj = new Date(h.timestamp || Date.now());
      const dateFormatted = dateObj.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeFormatted = dateObj.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        idKlaim: h.idKlaim,
        rawTimestamp: dateObj.getTime(),
        rawDate: h.tglPeriksa || h.tglDo || dateObj.toISOString().split('T')[0],
        tgl: `${dateFormatted} ${timeFormatted} WIB`,
        tglSelesai: h.tglSelesaiDealer || '',
        status: h.status,
        noSj: h.noSj.replace(/^'/, ''),
        tglDo: h.tglDo,
        tglPeriksa: h.tglPeriksa,
        kodeAhm: h.kodeAhm,
        namaDealer: h.namaDealer,
        sopirPJ: h.sopirPJ,
        nopolPJ: h.nopolPJ,
        transporterPJ: h.transporterPJ,
        parafSopirPJ: h.parafSopirPJ,
        fotoSopirPJ: h.fotoSopirPJ || '', // << KEMBALIKAN KE CLIENT
        metodeKembali: h.metodeKembali,
        sopirKembali: h.sopirKembali,
        nopolKembali: h.nopolKembali,
        transporterKembali: h.transporterKembali,
        parafUser: h.parafUser,
        draftDeadline: h.draftDeadline,
        lastStep: h.lastStep,
        mdStatusPenerimaan: h.mdStatusPenerimaan,
        mdJenisPerbaikan: h.mdJenisPerbaikan,
        mdTargetSelesai: h.mdTargetSelesai,
        mdApprovalKaGudang: h.mdApprovalKaGudang,
        mdValidasiRepairman: h.mdValidasiRepairman,
        mdSopirBalik: h.mdSopirBalik,
        mdNopolBalik: h.mdNopolBalik,
        mdTransporterBalik: h.mdTransporterBalik,
        isUrgent: h.isUrgent === 'URGENT',
        items,
      };
    });

    return {
      success: true,
      data: fullClaims,
    };
  },

  // 5b. Get Single Claim by ID (Untuk Public Receipt Link tanpa batas login)
  getClaimById(idKlaim: string) {
    const db = initDb();
    const cleanId = (idKlaim || '').trim();
    const h = db.klaimHeader.find((header) => header.idKlaim === cleanId);
    if (!h) {
      return { success: false, data: null, message: 'Klaim tidak ditemukan.' };
    }

    const items = db.klaimDetail
      .filter((d) => d.idKlaim === h.idKlaim)
      .map((d) => ({
        indexMotor: d.indexMotor,
        tipe: d.tipeMotor,
        warna: d.warna,
        noMesin: d.noMesin.replace(/^'/, ''),
        noRangka: d.noRangka.replace(/^'/, ''),
        namaPart: d.namaPart,
        kerusakan: d.jenisKerusakan,
        penyebab: d.penyebab,
        fotoPart: d.fotoPart || '',
      }));

    const dateObj = new Date(h.timestamp || Date.now());
    const dateFormatted = dateObj.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeFormatted = dateObj.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const claimItem = {
      idKlaim: h.idKlaim,
      rawTimestamp: dateObj.getTime(),
      rawDate: h.tglPeriksa || h.tglDo || dateObj.toISOString().split('T')[0],
      tgl: `${dateFormatted} ${timeFormatted} WIB`,
      tglSelesai: h.tglSelesaiDealer || '',
      status: h.status,
      noSj: h.noSj.replace(/^'/, ''),
      tglDo: h.tglDo,
      tglPeriksa: h.tglPeriksa,
      kodeAhm: h.kodeAhm,
      namaDealer: h.namaDealer,
      sopirPJ: h.sopirPJ,
      nopolPJ: h.nopolPJ,
      transporterPJ: h.transporterPJ,
      parafSopirPJ: h.parafSopirPJ,
      fotoSopirPJ: h.fotoSopirPJ || '',
      metodeKembali: h.metodeKembali,
      sopirKembali: h.sopirKembali,
      nopolKembali: h.nopolKembali,
      transporterKembali: h.transporterKembali,
      parafUser: h.parafUser,
      draftDeadline: h.draftDeadline,
      lastStep: h.lastStep,
      mdStatusPenerimaan: h.mdStatusPenerimaan,
      mdJenisPerbaikan: h.mdJenisPerbaikan,
      mdTargetSelesai: h.mdTargetSelesai,
      mdApprovalKaGudang: h.mdApprovalKaGudang,
      mdValidasiRepairman: h.mdValidasiRepairman,
      mdSopirBalik: h.mdSopirBalik,
      mdNopolBalik: h.mdNopolBalik,
      mdTransporterBalik: h.mdTransporterBalik,
      isUrgent: h.isUrgent === 'URGENT',
      items,
    };

    return {
      success: true,
      data: claimItem,
    };
  },

  // 6. Get Dashboard Stats Filtered by Kode AHM
  getDashboardStats(kodeAhm: string) {
    const db = initDb();
    const headers = db.klaimHeader.filter((h) => isCodeMatch(h.kodeAhm, kodeAhm));

    let draft = 0;
    let kirimMD = 0;
    let prosesMD = 0;
    let kirimDealer = 0;
    let selesai = 0;
    let alertDraft = false;

    const now = Date.now();

    headers.forEach((h) => {
      const s = (h.status || '').toLowerCase();
      if (s === 'draft' || s.includes('draft')) {
        draft++;
        if (h.draftDeadline && new Date(h.draftDeadline).getTime() < now) {
          alertDraft = true;
        }
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
      alertDraft,
    };
  },

  // 7. Save Claim: Links Kode AHM directly to Klaim_Header and Klaim_Detail
  simpanPengajuanKlaim(payload: any) {
    const db = initDb();
    const userKode = cleanKodeAhm(payload.user?.kodeAhm);
    const userDealerName = payload.user?.namaDealer || 'Dealer Honda';
    const idKlaim = payload.idKlaim || `CLM-${userKode}-${Date.now()}`;
    const status = payload.status || 'Draft';

    const existingHeaderIdx = db.klaimHeader.findIndex((h) => h.idKlaim === idKlaim);

    const cleanMetode = (payload.step3?.metode || '').trim().toUpperCase();
    const validMetode = (cleanMetode === 'DIKIRIM LANGSUNG' || cleanMetode === 'DITITIP') ? cleanMetode : '';

    const headerRecord: StoredClaimHeader = {
      idKlaim,
      timestamp: new Date().toISOString(),
      status,
      lastStep: typeof payload.lastStep === 'number' ? payload.lastStep : undefined,
      noSj: "'" + (payload.step1?.noSj || ''),
      tglDo: payload.step1?.tglDo || '',
      tglPeriksa: payload.step1?.tglPemeriksaan || '',
      kodeAhm: userKode,
      namaDealer: userDealerName,
      sopirPJ: (payload.step1?.namaSopirPJ || '').toUpperCase(),
      nopolPJ: (payload.step1?.nopolPJ || '').toUpperCase(),
      transporterPJ: payload.step1?.transporterPJ || '',
      parafSopirPJ: payload.step1?.parafSopir || '',
      fotoSopirPJ: payload.step1?.fotoSopirPJ || '', // << BACA DARI PAYLOAD STEP 1
      metodeKembali: validMetode,
      sopirKembali: (payload.step3?.namaSopirKembali || '').toUpperCase(),
      nopolKembali: (payload.step3?.nopolKembali || '').toUpperCase(),
      transporterKembali: payload.step3?.transporterKembali || '',
      parafUser: payload.step3?.parafUser || '',
      draftDeadline:
        status === 'Draft' ? new Date(Date.now() + 24 * 3600000).toISOString() : '',
    };

    if (existingHeaderIdx >= 0) {
      // Retain operational MD columns if updating
      const prev = db.klaimHeader[existingHeaderIdx];
      headerRecord.mdStatusPenerimaan = prev.mdStatusPenerimaan;
      headerRecord.mdJenisPerbaikan = prev.mdJenisPerbaikan;
      headerRecord.mdTargetSelesai = prev.mdTargetSelesai;
      headerRecord.mdApprovalKaGudang = prev.mdApprovalKaGudang;
      headerRecord.mdValidasiRepairman = prev.mdValidasiRepairman;
      headerRecord.mdSopirBalik = prev.mdSopirBalik;
      headerRecord.mdNopolBalik = prev.mdNopolBalik;
      headerRecord.mdTransporterBalik = prev.mdTransporterBalik;
      headerRecord.tglSelesaiDealer = prev.tglSelesaiDealer;
      headerRecord.isUrgent = prev.isUrgent;

      db.klaimHeader[existingHeaderIdx] = headerRecord;
    } else {
      db.klaimHeader.unshift(headerRecord);
    }

    // Remove old details for this claim and append new ones
    db.klaimDetail = db.klaimDetail.filter((d) => d.idKlaim !== idKlaim);

    if (Array.isArray(payload.motors)) {
      payload.motors.forEach((motor: any, mIdx: number) => {
        if (Array.isArray(motor.parts)) {
          motor.parts.forEach((part: any, pIdx: number) => {
            db.klaimDetail.push({
              idDetail: `${idKlaim}-D${mIdx + 1}-${pIdx + 1}`,
              idKlaim,
              indexMotor: mIdx + 1,
              tipeMotor: (motor.tipeMotor || '').toUpperCase(),
              warna: (motor.warna || '').toUpperCase(),
              noMesin: "'" + (motor.noMesin || '').toUpperCase(),
              noRangka: "'" + (motor.noRangka || '').toUpperCase(),
              namaPart: part.namaPart || '',
              jenisKerusakan: part.jenisKerusakan || '',
              penyebab: part.penyebab || '',
              fotoPart: part.fotoPart || '',
            });
          });
        }
      });
    }

    saveDb(db);
    return {
      success: true,
      idKlaim,
      status,
      message: 'Klaim berhasil disimpan ke basis data Spreadsheet.',
    };
  },

  // 8. Confirm Claim Finished
  dealerKonfirmasiSelesai(idKlaim: string) {
    const db = initDb();
    const header = db.klaimHeader.find((h) => h.idKlaim === idKlaim);
    if (header) {
      header.status = 'Selesai';
      header.tglSelesaiDealer = new Date().toISOString();
      saveDb(db);
      return { success: true, message: 'Status klaim berhasil diperbarui menjadi Selesai.' };
    }
    return { success: false, message: 'Klaim tidak ditemukan.' };
  },

  // 8b. Confirm Claim Return (Part Not OK)
  dealerKonfirmasiRetur(idKlaim: string, alasan: string) {
    const db = initDb();
    const header = db.klaimHeader.find((h) => h.idKlaim === idKlaim);
    if (header) {
      header.status = 'Proses di MD';
      header.mdValidasiRepairman = 'Retur: ' + alasan;
      saveDb(db);
      return { success: true, message: 'Status klaim berhasil diperbarui menjadi Retur ke MD.' };
    }
    return { success: false, message: 'Klaim tidak ditemukan.' };
  },

  // 8c. Sinkronisasi Satu Arah (Mirroring) dari Google Spreadsheet ke Database Lokal
  // Memastikan klaim yang sudah dihapus di Google Spreadsheet otomatis ikut terhapus dari spreadsheet_database.json
  syncRemoteClaims(kodeAhm: string, remoteClaims: any[]) {
    if (!kodeAhm) return;
    try {
      const db = initDb();
      const safeRemote = Array.isArray(remoteClaims) ? remoteClaims : [];

      // Hapus seluruh header & detail lama milik kodeAhm ini agar tidak menjadi data zombie
      const oldHeaderIds = new Set(
        db.klaimHeader
          .filter((h) => isCodeMatch(h.kodeAhm, kodeAhm))
          .map((h) => h.idKlaim)
      );

      db.klaimHeader = db.klaimHeader.filter((h) => !isCodeMatch(h.kodeAhm, kodeAhm));
      db.klaimDetail = db.klaimDetail.filter((d) => !oldHeaderIds.has(d.idKlaim));

      // Masukkan kembali hanya klaim yang benar-benar masih ada di Google Spreadsheet saat ini
      const newHeaders: StoredClaimHeader[] = [];
      const newDetails: StoredClaimDetail[] = [];

      safeRemote.forEach((c: any) => {
        if (!c || !c.idKlaim) return;
        const cleanId = String(c.idKlaim).trim();
        newHeaders.push({
          idKlaim: cleanId,
          timestamp: c.rawTimestamp ? new Date(c.rawTimestamp).toISOString() : new Date().toISOString(),
          status: c.status || 'Draft',
          lastStep: typeof c.lastStep === 'number' ? c.lastStep : undefined,
          noSj: "'" + String(c.noSj || '').replace(/^'/, ''),
          tglDo: c.tglDo || '',
          tglPeriksa: c.tglPeriksa || '',
          kodeAhm: c.kodeAhm || kodeAhm,
          namaDealer: c.namaDealer || '',
          sopirPJ: c.sopirPJ || '',
          nopolPJ: c.nopolPJ || '',
          transporterPJ: c.transporterPJ || '',
          parafSopirPJ: c.parafSopirPJ || '',
          fotoSopirPJ: c.fotoSopirPJ || '',
          metodeKembali: c.metodeKembali || '',
          sopirKembali: c.sopirKembali || '',
          nopolKembali: c.nopolKembali || '',
          transporterKembali: c.transporterKembali || '',
          parafUser: c.parafUser || '',
          draftDeadline: c.draftDeadline || '',
          mdStatusPenerimaan: c.mdStatusPenerimaan || '',
          mdJenisPerbaikan: c.mdJenisPerbaikan || '',
          mdTargetSelesai: c.mdTargetSelesai || '',
          mdApprovalKaGudang: c.mdApprovalKaGudang || '',
          mdValidasiRepairman: c.mdValidasiRepairman || '',
          mdSopirBalik: c.mdSopirBalik || '',
          mdNopolBalik: c.mdNopolBalik || '',
          mdTransporterBalik: c.mdTransporterBalik || '',
          tglSelesaiDealer: c.tglSelesai || '',
          isUrgent: c.isUrgent ? 'URGENT' : '',
        });

        if (Array.isArray(c.items)) {
          c.items.forEach((item: any, idx: number) => {
            newDetails.push({
              idDetail: `${cleanId}-D${idx + 1}`,
              idKlaim: cleanId,
              indexMotor: item.indexMotor || 1,
              tipeMotor: item.tipe || '',
              warna: item.warna || '',
              noMesin: "'" + String(item.noMesin || '').replace(/^'/, ''),
              noRangka: "'" + String(item.noRangka || '').replace(/^'/, ''),
              namaPart: item.namaPart || '',
              jenisKerusakan: item.kerusakan || '',
              penyebab: item.penyebab || '',
              fotoPart: item.fotoPart || '',
            });
          });
        }
      });

      db.klaimHeader.unshift(...newHeaders);
      db.klaimDetail.push(...newDetails);
      saveDb(db);
    } catch (err) {
      console.warn('[SpreadsheetDB] Gagal menyinkronkan klaim remote ke lokal:', err);
    }
  },

  // 8d. Hapus Klaim / Draft secara Eksplisit dari Database Lokal
  hapusKlaim(idKlaim: string, noSj?: string, kodeAhm?: string) {
    const db = initDb();
    const cleanId = (idKlaim || '').trim();
    const cleanSj = (noSj || '').replace(/\D/g, '');

    const removedHeaderIds = new Set<string>();

    db.klaimHeader = db.klaimHeader.filter((h) => {
      const matchId = cleanId && h.idKlaim === cleanId;
      const hSj = (h.noSj || '').replace(/\D/g, '');
      const matchSj =
        cleanSj &&
        hSj === cleanSj &&
        (!kodeAhm || isCodeMatch(h.kodeAhm, kodeAhm));

      if (matchId || matchSj) {
        removedHeaderIds.add(h.idKlaim);
        return false;
      }
      return true;
    });

    if (cleanId) removedHeaderIds.add(cleanId);

    db.klaimDetail = db.klaimDetail.filter((d) => !removedHeaderIds.has(d.idKlaim));
    saveDb(db);

    return {
      success: true,
      idKlaim: cleanId,
      message: 'Klaim berhasil dihapus secara permanen.',
    };
  },

  // 9. Check Data Version
  checkDataVersion(clientVersion: string) {
    const db = initDb();
    return {
      isOutdated: db.lastUpdated !== clientVersion,
      serverVersion: db.lastUpdated,
    };
  },
};
