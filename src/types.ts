export interface UserProfile {
  email: string;
  nama: string;
  noHp: string;
  kodeAhm: string;
  namaDealer: string;
  kodeDealer: string;
  kategori: string;
  kota: string;
  sentraDistribusi: string;
  role: string;
}

export interface TransporterMasterItem {
  transporter: string;
  nopol: string;
}

export interface MotorMasterItem {
  jenisMotor?: string;
  tipe: string;
  warna: string;
  namaWarna: string;
}

export interface PartMasterItem {
  tipe: string;
  namaPart: string;
}

export interface MasterDataResponse {
  success: boolean;
  transporterList: TransporterMasterItem[];
  motorList: MotorMasterItem[];
  partList: PartMasterItem[];
  kerusakanList: string[];
  penyebabList: string[];
  message?: string;
}

export interface DashboardStats {
  draft: number;
  kirimMD: number;
  prosesMD: number;
  kirimDealer: number;
  selesai: number;
  alertDraft: boolean;
}

export interface ClaimPartDetail {
  indexMotor: number;
  tipe: string;
  warna: string;
  noMesin: string;
  noRangka: string;
  namaPart: string;
  kerusakan: string;
  penyebab: string;
  fotoPart: string;
}

export interface ClaimItem {
  idKlaim: string;
  rawTimestamp: number;
  rawDate: string;
  tgl: string;
  tglSelesai: string;
  status: string; // 'Draft' | 'Dikirim ke MD' | 'Proses di MD' | 'Dikirim ke Dealer' | 'Selesai' | 'Ditolak'
  noSj: string;
  tglDo: string;
  tglPeriksa: string;
  kodeAhm: string;
  namaDealer: string;
  sopirPJ: string;
  nopolPJ: string;
  transporterPJ: string;
  parafSopirPJ: string;
  fotoSopirPJ?: string; // << TAMBAHKAN DI SINI (Kolom AD Spreadsheet)
  metodeKembali: string; // 'DIKIRIM LANGSUNG' | 'DITITIP'
  sopirKembali: string;
  nopolKembali: string;
  transporterKembali: string;
  parafUser: string;
  draftDeadline: string;
  kontakPengurusPJ: string;
  kontakPengurusKembali: string;
  kontakRepairman: string;
  kontakKaGudang: string;
  noHpPdi: string;
  mdJenisPerbaikan?: string;
  mdTargetSelesai?: string;
  mdValidasiRepairman?: string;
  mdApprovalKaGudang?: string;
  mdSopirBalik?: string;
  mdNopolBalik?: string;
  mdTransporterBalik?: string;
  mdStatusPenerimaan?: string;
  kota?: string;
  isUrgent?: boolean;
  kodeDealer?: string;
  lastStep?: number;
  items: ClaimPartDetail[];
}

export interface PayloadPartItem {
  namaPart: string;
  jenisKerusakan: string;
  penyebab: string;
  fotoPart: string;
}

export interface PayloadMotorItem {
  tipeMotor: string;
  warna: string;
  noMesin: string;
  noRangka: string;
  parts: PayloadPartItem[];
}

export interface SimpanKlaimPayload {
  idKlaim?: string;
  user: UserProfile;
  status: 'Draft' | 'Dikirim ke MD';
  lastStep?: number;
  step1: {
    noSj: string;
    tglDo: string;
    tglPemeriksaan: string;
    namaSopirPJ: string;
    nopolPJ: string;
    transporterPJ: string;
    parafSopir: string;
    fotoSopirPJ?: string; // << TAMBAHKAN DI SINI
  };
  motors: PayloadMotorItem[];
  step3: {
    metode: string;
    namaSopirKembali: string;
    nopolKembali: string;
    transporterKembali: string;
    parafUser: string;
  };
}

export interface ClaimStatusNotification {
  id: string;
  idKlaim: string;
  noSj: string;
  oldStatus: string;
  newStatus: string;
  timestamp: number;
  read: boolean;
}
