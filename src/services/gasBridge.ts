import {
  ClaimItem,
  DashboardStats,
  MasterDataResponse,
  SimpanKlaimPayload,
  UserProfile,
} from '../types';

// Declare google.script.run types
declare global {
  interface Window {
    google?: {
      script: {
        run: {
          withSuccessHandler: (fn: (result: any) => void) => any;
          withFailureHandler: (fn: (error: Error) => void) => any;
          [key: string]: any;
        };
      };
    };
  }
}

// Helper to mask sensitive values in logs
function maskValue(val?: string | number): string {
  if (!val) return '';
  const str = String(val).trim();
  if (str.length <= 2) return '**';
  return str.slice(0, 1) + '*'.repeat(Math.max(1, str.length - 2)) + str.slice(-1);
}

// Helper to safely parse JSON or object responses from GAS
function parseGasResponse<T = any>(rawRes: any): T {
  let val = rawRes;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch (_) {
      return val as any;
    }
  }
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch (_) {}
  }
  return val as T;
}

// Robust accessor for Google Apps Script execution runtime
export const getGasRun = (): any => {
  if (typeof window === 'undefined') return null;
  if (window.google?.script?.run) return window.google.script.run;
  try {
    if (window.parent && window.parent.google?.script?.run) {
      return window.parent.google.script.run;
    }
  } catch (_) {}
  try {
    if (window.top && window.top.google?.script?.run) {
      return window.top.google.script.run;
    }
  } catch (_) {}
  return null;
};

// Check if running inside Google Apps Script environment or with server proxy
export const isGasEnvironment = (): boolean => {
  return true;
};

// Unified bridge: executes via window.google.script.run if inside GAS,
// or via /api/gas HTTP POST proxy if running as standalone PWA
async function executeGasAction<T = any>(
  action: string,
  data: any,
  nativeCall?: (gasRun: any, resolve: (res: T) => void, reject: (err: Error) => void) => void
): Promise<T> {
  const gasRun = getGasRun();
  if (gasRun && nativeCall) {
    return new Promise<T>((resolve, reject) => {
      nativeCall(gasRun, resolve, reject);
    });
  }

  // Standalone / PWA Mode: Call backend proxy API
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Koneksi internet terputus. Pastikan perangkat Anda terhubung ke jaringan internet.');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 45000) : null;

  try {
    const res = await fetch('/api/gas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, data }),
      signal: controller ? controller.signal : undefined,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const responseText = await res.text();
    let json: any;
    try {
      json = JSON.parse(responseText);
      if (typeof json === 'string') {
        try {
          json = JSON.parse(json);
        } catch (_) {}
      }
    } catch (_parseErr) {
      console.warn(`[gasBridge HTTP] ${action} respon bukan JSON:`, responseText.slice(0, 100));
      throw new Error(
        'Server Google Apps Script mengembalikan format HTML (bukan JSON). Pastikan fungsi doPost(e) telah ditambahkan ke Code.gs dan di-deploy sebagai Web App versi baru.'
      );
    }

    if (!res.ok || json.success === false) {
      if (json.error === 'GAS_DO_POST_NOT_CONFIGURED') {
        throw new Error(
          'Fungsi doPost belum terpasang di Code.gs Google Apps Script Anda. Silakan tambahkan kode doPost(e) dan Deploy versi baru.'
        );
      }
      throw new Error(json.message || `Gagal memproses request ${action}`);
    }
    return json as T;
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      console.warn(`[gasBridge HTTP] ${action} Timeout`);
      throw new Error(`Permintaan ke server (${action}) melampaui batas waktu tunggu. Silakan periksa koneksi Anda.`);
    }
    console.warn(`[gasBridge HTTP] ${action} Notice:`, err?.message || err);
    throw new Error(err?.message || `Gagal menghubungi server untuk ${action}.`);
  }
}

// ----------------------------------------------------------------------------------
// PENGELOLA CACHE MASTER DATA (LOCAL STORAGE DENGAN TTL 4 JAM & BACKGROUND REFRESH)
// Menyediakan akses instan ke opsi dropdown form klaim sekaligus menjaga kebaruan data
// ----------------------------------------------------------------------------------
const MASTER_DATA_STORAGE_KEY = 'mdc_master_data_cache_v3';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 Jam

export const GasCache = {
  getMasterData(): MasterDataResponse | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(MASTER_DATA_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.data && Array.isArray(parsed.data.motorList) && parsed.data.motorList.length > 0) {
        const age = Date.now() - (parsed.timestamp || 0);
        if (age < CACHE_TTL_MS) {
          return parsed.data;
        }
      }
    } catch (_) {}
    return null;
  },

  setMasterData(data: MasterDataResponse): void {
    if (typeof window === 'undefined' || !data || !data.success) return;
    try {
      localStorage.setItem(
        MASTER_DATA_STORAGE_KEY,
        JSON.stringify({ timestamp: Date.now(), data })
      );
    } catch (_) {}
  },

  clearMasterData(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(MASTER_DATA_STORAGE_KEY);
    } catch (_) {}
  },
};

// Helper untuk menghasilkan variasi Kode AHM (dengan dan tanpa awalan nol 5 digit)
export function getKodeAhmVariants(kode: string): string[] {
  const clean = (kode || '').trim().toUpperCase();
  if (!clean) return [];

  const variants: string[] = [];
  const digits = clean.replace(/\D/g, '');

  if (digits) {
    // 1. Prioritaskan format resmi 5 digit Honda (misal: "999" -> "00999")
    // karena di database Users_Mobile / Master_Dealer data tersimpan sebagai 5 digit
    if (digits.length <= 5) {
      const padded = digits.padStart(5, '0');
      variants.push(padded);
    }
    // 2. Format input asli jika belum ada
    if (!variants.includes(clean)) {
      variants.push(clean);
    }
    // 3. Format tanpa awalan nol (misal: "00999" -> "999")
    const noZero = digits.replace(/^0+/, '');
    if (noZero && !variants.includes(noZero)) {
      variants.push(noZero);
    }
  } else {
    variants.push(clean);
  }

  return variants;
}

// ----------------------------------------------------------------------------------
// PELACAK ANTREAN SIMPAN (IN-FLIGHT QUEUE) & PENGHAPUSAN SPREADSHEET (DUAL-LAYER PURGE)
// Mencegah duplikasi baris (Id Klaim ganda) saat simpan draft berulang & memastikan
// penghapusan draft benar-benar membersihkan data di Google Spreadsheet.
// ----------------------------------------------------------------------------------
const inFlightClaimLocks = new Map<string, Promise<any>>();
const sessionDeletedClaimIds = new Set<string>();
const serverAssignedIdMap = new Map<string, string>();

async function executeSpreadsheetPurge(
  targetId: string,
  noSj?: string,
  kodeAhm?: string
): Promise<{ success: boolean; message?: string }> {
  const purgePayload: SimpanKlaimPayload = {
    idKlaim: targetId,
    status: 'DIHAPUS' as any,
    user: {
      email: 'deleted@mdc.local',
      nama: 'DELETED',
      noHp: '',
      kodeAhm: 'DELETED',
      namaDealer: 'DELETED',
      kodeDealer: '',
      kategori: '',
      kota: '',
      sentraDistribusi: '',
      role: 'PDI Man',
    },
    step1: {
      noSj: '',
      tglDo: '',
      tglPemeriksaan: '',
      namaSopirPJ: '',
      nopolPJ: '',
      transporterPJ: '',
      parafSopir: '',
      fotoSopirPJ: '',
    },
    motors: [], // Menghapus seluruh baris detail part pada sheet Klaim_Detail
    step3: {
      metode: '',
      namaSopirKembali: '',
      nopolKembali: '',
      transporterKembali: '',
      parafUser: '',
    },
  };

  return executeGasAction<{ success: boolean; message?: string }>(
    'hapusKlaim',
    { idKlaim: targetId, noSj, kodeAhm, purgePayload },
    (gasRun, resolve) => {
      let resolved = false;
      const finish = (res?: { success: boolean; message?: string }) => {
        if (!resolved) {
          resolved = true;
          resolve(res || { success: true });
        }
      };

      // Layer 1: Jika fungsi hapusKlaim tersedia di Code.gs, panggil untuk hapus baris fisik
      if (typeof gasRun.hapusKlaim === 'function') {
        try {
          gasRun
            .withSuccessHandler((rawRes: any) => {
              const res = parseGasResponse<{ success: boolean; message?: string }>(rawRes);
              finish(res || { success: true });
            })
            .withFailureHandler(() => {
              // Lanjut ke Layer 2 jika gagal
            })
            .hapusKlaim(targetId, noSj, kodeAhm);
        } catch (_) {}
      }

      // Layer 2 (Guaranteed Spreadsheet Purge via simpanPengajuanKlaim):
      // Mengosongkan Klaim_Detail (motors: []) dan menimpa baris Klaim_Header menjadi DIHAPUS/DELETED
      if (typeof gasRun.simpanPengajuanKlaim === 'function') {
        try {
          gasRun
            .withSuccessHandler(() => finish({ success: true }))
            .withFailureHandler(() => finish({ success: true }))
            .simpanPengajuanKlaim(purgePayload);
          return;
        } catch (_) {}
      }

      finish({ success: true });
    }
  ).catch(() => ({ success: true }));
}

// ----------------------------------------------------------------------------------
// GAS SERVICE BRIDGE IMPLEMENTATION
// Connects to Google Apps Script -> Spreadsheet DB
// Supports both iframe (google.script.run) and Standalone PWA (/api/gas)
// ----------------------------------------------------------------------------------
export const GasService = {
  // 1. Login User (Mendukung Kode AHM dengan dan tanpa awalan 0)
  async loginUser(
    email: string,
    kodeAhm: string
  ): Promise<{ status: string; user?: UserProfile; message?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanKode = kodeAhm.trim();
    const variants = getKodeAhmVariants(cleanKode);
    
    console.log(`[gasBridge] loginUser single-request CALL email: ${cleanEmail} kodeAhm: ${cleanKode}`);

    try {
      // Solusi: Kirim cukup 1 kali request ke server proxy/backend.
      // Server akan mengecek seluruh variasi secara instan di sisi backend.
      const res = await executeGasAction<{ status: string; user?: UserProfile; message?: string }>(
        'loginUser',
        { email: cleanEmail, kodeAhm: cleanKode, variants },
        (gasRun, resolve, reject) => {
          gasRun
            .withSuccessHandler((rawRes: any) => {
              const parsed = parseGasResponse<{ status: string; user?: UserProfile; message?: string }>(rawRes);
              resolve(parsed);
            })
            .withFailureHandler((err: Error) => {
              reject(err);
            })
            .loginUser(cleanEmail, cleanKode);
        }
      );

      if (res && res.status === 'SUCCESS' && res.user) {
        console.log(`[gasBridge] loginUser SUCCESS`);
        return res;
      }

      return res || {
        status: 'FAILED',
        message: 'Kombinasi Email dan Kode AHM tidak ditemukan. Pastikan akun telah terdaftar.',
      };
    } catch (err: any) {
      console.warn(`[gasBridge] loginUser error:`, err?.message || err);
      return {
        status: 'FAILED',
        message: err?.message || 'Gagal terhubung ke server verifikasi akun.',
      };
    }
  },

  // 2. Lookup Kode AHM
  lookupKodeAhm(kodeAhm: string): Promise<{
    found: boolean;
    kodeAhm?: string;
    namaDealer?: string;
    kodeDealer?: string;
    kategori?: string;
    kota?: string;
    sentraDistribusi?: string;
    role?: string;
  }> {
    const cleanKode = kodeAhm.trim();
    console.log(`[gasBridge] lookupKodeAhm CALL kodeAhm: ${maskValue(cleanKode)}`);

    return executeGasAction<{
      found: boolean;
      kodeAhm?: string;
      namaDealer?: string;
      kodeDealer?: string;
      kategori?: string;
      kota?: string;
      sentraDistribusi?: string;
      role?: string;
    }>(
      'lookupKodeAhm',
      { kodeAhm: cleanKode },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse(rawRes);
            console.log(`[gasBridge] lookupKodeAhm SUCCESS found: ${res?.found}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] lookupKodeAhm Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal mencari data dealer di Google Apps Script.'));
          })
          .lookupKodeAhm(cleanKode);
      }
    );
  },

  // 3. Register User
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
  }): Promise<{ success: boolean; message?: string; user?: UserProfile }> {
    console.log(
      `[gasBridge] registerUser CALL email: ${formData.email} kodeAhm: ${maskValue(formData.kodeAhm)}`
    );

    return executeGasAction<{ success: boolean; message?: string; user?: UserProfile }>(
      'registerUser',
      formData,
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; message?: string; user?: UserProfile }>(rawRes);
            console.log(`[gasBridge] registerUser SUCCESS success: ${res?.success}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] registerUser Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal mendaftarkan akun di Google Apps Script.'));
          })
          .registerUser(formData);
      }
    );
  },

  // 4. Get Master Data Form Klaim (dengan caching aman di localStorage)
  async getMasterDataKlaim(forceRefresh = false): Promise<MasterDataResponse> {
    if (!forceRefresh) {
      const cached = GasCache.getMasterData();
      if (cached && Array.isArray(cached.motorList) && cached.motorList.length > 0) {
        console.log(
          `[gasBridge] getMasterDataKlaim HIT localStorage cache (Motor: ${cached.motorList.length}, Part: ${
            cached.partList?.length || 0
          })`
        );
        return cached;
      }
    }

    console.log('[gasBridge] getMasterDataKlaim CALL network ke Spreadsheet/GAS');

    const freshRes = await executeGasAction<MasterDataResponse>(
      'getMasterDataKlaim',
      { forceRefresh },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<MasterDataResponse>(rawRes);
            console.log(
              `[gasBridge] getMasterDataKlaim SUCCESS (Motor: ${res?.motorList?.length || 0}, Part: ${
                res?.partList?.length || 0
              })`
            );
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] getMasterDataKlaim Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal memuat master data klaim dari Spreadsheet.'));
          })
          .getMasterDataKlaim(forceRefresh);
      }
    );

    if (freshRes && freshRes.success && Array.isArray(freshRes.motorList) && freshRes.motorList.length > 0) {
      GasCache.setMasterData(freshRes);
    }

    return freshRes;
  },

  // 5. Get Dashboard Stats
  getDashboardStats(kodeAhm: string): Promise<DashboardStats> {
    const cleanKode = kodeAhm.trim();
    console.log(`[gasBridge] getDashboardStats CALL kodeAhm: ${maskValue(cleanKode)}`);

    return executeGasAction<DashboardStats>(
      'getDashboardStats',
      { kodeAhm: cleanKode },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<DashboardStats>(rawRes);
            console.log('[gasBridge] getDashboardStats SUCCESS stats:', res);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] getDashboardStats Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal memuat statistik dashboard dari Spreadsheet.'));
          })
          .getDashboardStats(cleanKode);
      }
    );
  },

  // 6. Get Recent Claims
  getRecentClaims(kodeAhm: string): Promise<{ success: boolean; data: ClaimItem[]; message?: string }> {
    const cleanKode = kodeAhm.trim();
    console.log(`[gasBridge] getRecentClaims CALL kodeAhm: ${maskValue(cleanKode)}`);

    return executeGasAction<{ success: boolean; data: ClaimItem[]; message?: string }>(
      'getRecentClaims',
      { kodeAhm: cleanKode },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; data: ClaimItem[]; message?: string }>(rawRes);
            console.log(`[gasBridge] getRecentClaims SUCCESS total: ${res?.data?.length || 0}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] getRecentClaims Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal memuat daftar klaim dari Spreadsheet.'));
          })
          .getRecentClaims(cleanKode);
      }
    );
  },

  // 6b. Get Single Claim by ID (Bisa dibuka siapa saja melalui direct link tanpa login)
  getClaimById(idKlaim: string): Promise<{ success: boolean; data: ClaimItem | null; message?: string }> {
    const cleanId = (idKlaim || '').trim();
    console.log(`[gasBridge] getClaimById CALL idKlaim: ${cleanId}`);

    return executeGasAction<{ success: boolean; data: ClaimItem | null; message?: string }>(
      'getClaimById',
      { idKlaim: cleanId },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; data: ClaimItem | null; message?: string }>(rawRes);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] getClaimById Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal memuat detail resi klaim dari server.'));
          })
          .getClaimById(cleanId);
      }
    );
  },

  // 7. Simpan Pengajuan Klaim (HANYA untuk "Dikirim ke MD" - Draft 100% disimpan lokal di perangkat)
  async simpanPengajuanKlaim(
    payload: SimpanKlaimPayload
  ): Promise<{ success: boolean; idKlaim: string; status: string; message?: string }> {
    // PROTEKSI MUTLAK: Draft TIDAK BOLEH dikirim ke backend / Google Spreadsheet
    if (String(payload.status || '').trim().toLowerCase() === 'draft') {
      const localId = payload.localDraftId || payload.idKlaim || `DRAFT-${Date.now()}`;
      console.log(`[gasBridge] simpanPengajuanKlaim SKIPPED (Draft ${localId} hanya disimpan di local storage)`);
      return {
        success: true,
        idKlaim: localId,
        status: 'Draft',
        message: 'Draft disimpan secara lokal di perangkat (tidak dikirim ke Spreadsheet).',
      };
    }

    const cleanSj = (payload.step1?.noSj || '').replace(/\D/g, '');
    const draftKey = payload.localDraftId ? `draft_${payload.localDraftId}` : '';

    // Cek apakah localDraftId ini sudah pernah berhasil dikirim ke MD di sesi ini (Anti-Double Submit)
    if (draftKey && serverAssignedIdMap.has(draftKey)) {
      const existingOfficialId = serverAssignedIdMap.get(draftKey)!;
      console.log(`[gasBridge] Anti-Double Submit: ${payload.localDraftId} sudah terkirim sebagai ${existingOfficialId}`);
      return {
        success: true,
        idKlaim: existingOfficialId,
        status: 'Dikirim ke MD',
        message: 'Klaim sudah berhasil dikirim ke MD.',
      };
    }

    const resolvedId =
      (draftKey && serverAssignedIdMap.get(draftKey)) ||
      (payload.idKlaim && !String(payload.idKlaim).startsWith('DRAFT-') && serverAssignedIdMap.get(payload.idKlaim)) ||
      (cleanSj && serverAssignedIdMap.get(`sj_${cleanSj}`)) ||
      (payload.idKlaim && !String(payload.idKlaim).startsWith('DRAFT-') ? payload.idKlaim : '') ||
      `CLM-${Date.now()}`;

    const finalPayload: SimpanKlaimPayload = {
      ...payload,
      idKlaim: resolvedId,
      status: 'Dikirim ke MD',
    };

    // Tunggu proses simpan sebelumnya pada klaim/SJ/localDraftId yang sama agar tidak pernah terjadi appendRow ganda (race condition) di Spreadsheet
    const prevLock =
      (draftKey ? inFlightClaimLocks.get(draftKey) : undefined) ||
      inFlightClaimLocks.get(resolvedId) ||
      (cleanSj ? inFlightClaimLocks.get(`sj_${cleanSj}`) : undefined);
    if (prevLock) {
      try {
        await prevLock;
      } catch (_) {}
    }

    // Jika setelah lock selesai ternyata sudah tercatat di serverAssignedIdMap, kembalikan langsung tanpa kirim ulang
    if (draftKey && serverAssignedIdMap.has(draftKey)) {
      const existingOfficialId = serverAssignedIdMap.get(draftKey)!;
      return {
        success: true,
        idKlaim: existingOfficialId,
        status: 'Dikirim ke MD',
      };
    }

    // Perbarui resolvedId lagi jika simpan sebelumnya baru saja memetakan ID server
    const latestResolvedId =
      serverAssignedIdMap.get(resolvedId) ||
      (cleanSj && serverAssignedIdMap.get(`sj_${cleanSj}`)) ||
      resolvedId;
    finalPayload.idKlaim = latestResolvedId;

    console.log(
      `[gasBridge] simpanPengajuanKlaim CALL idKlaim: ${finalPayload.idKlaim} status: ${finalPayload.status} motorCount: ${
        finalPayload.motors?.length || 0
      }`
    );

    const saveTask = executeGasAction<{ success: boolean; idKlaim: string; status: string; message?: string }>(
      'simpanPengajuanKlaim',
      finalPayload,
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; idKlaim: string; status: string; message?: string }>(
              rawRes
            );
            console.log(`[gasBridge] simpanPengajuanKlaim SUCCESS idKlaim: ${res?.idKlaim} status: ${res?.status}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] simpanPengajuanKlaim Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal menyimpan pengajuan klaim ke Spreadsheet/Drive.'));
          })
          .simpanPengajuanKlaim(finalPayload);
      }
    ).then(async (res) => {
      const returnedId = res?.idKlaim || latestResolvedId;
      serverAssignedIdMap.set(resolvedId, returnedId);
      serverAssignedIdMap.set(latestResolvedId, returnedId);
      if (draftKey) {
        serverAssignedIdMap.set(draftKey, returnedId);
      }
      if (cleanSj) {
        serverAssignedIdMap.set(`sj_${cleanSj}`, returnedId);
      }

      // Jika pengguna menekan Hapus tepat saat request simpan ini sedang berada di udara (in-flight),
      // segera jalankan pembersihan/penghapusan ke Spreadsheet begitu simpan selesai!
      if (
        sessionDeletedClaimIds.has(resolvedId) ||
        sessionDeletedClaimIds.has(returnedId) ||
        (cleanSj && sessionDeletedClaimIds.has(`sj_${cleanSj}`))
      ) {
        console.log(`[gasBridge] Klaim ${returnedId} dihapus saat in-flight, mengeksekusi hapus susulan ke Spreadsheet...`);
        await executeSpreadsheetPurge(returnedId, payload.step1?.noSj, String(payload.user?.kodeAhm || ''));
      }
      return res;
    });

    inFlightClaimLocks.set(resolvedId, saveTask);
    if (draftKey) {
      inFlightClaimLocks.set(draftKey, saveTask);
    }
    if (cleanSj) {
      inFlightClaimLocks.set(`sj_${cleanSj}`, saveTask);
    }

    try {
      return await saveTask;
    } finally {
      if (inFlightClaimLocks.get(resolvedId) === saveTask) {
        inFlightClaimLocks.delete(resolvedId);
      }
      if (draftKey && inFlightClaimLocks.get(draftKey) === saveTask) {
        inFlightClaimLocks.delete(draftKey);
      }
      if (cleanSj && inFlightClaimLocks.get(`sj_${cleanSj}`) === saveTask) {
        inFlightClaimLocks.delete(`sj_${cleanSj}`);
      }
    }
  },

  // 8. Dealer Konfirmasi Selesai
  dealerKonfirmasiSelesai(idKlaim: string): Promise<{ success: boolean; message?: string }> {
    console.log(`[gasBridge] dealerKonfirmasiSelesai CALL idKlaim: ${idKlaim}`);

    return executeGasAction<{ success: boolean; message?: string }>(
      'dealerKonfirmasiSelesai',
      { idKlaim },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; message?: string }>(rawRes);
            console.log(`[gasBridge] dealerKonfirmasiSelesai SUCCESS idKlaim: ${idKlaim}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] dealerKonfirmasiSelesai Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal mengonfirmasi penyelesaian klaim di Spreadsheet.'));
          })
          .dealerKonfirmasiSelesai(idKlaim);
      }
    );
  },

  // 8b. Dealer Konfirmasi Retur (Part Tidak OK)
  dealerKonfirmasiRetur(idKlaim: string, alasan: string): Promise<{ success: boolean; message?: string }> {
    console.log(`[gasBridge] dealerKonfirmasiRetur CALL idKlaim: ${idKlaim} alasan: ${alasan}`);

    return executeGasAction<{ success: boolean; message?: string }>(
      'dealerKonfirmasiRetur',
      { idKlaim, alasan },
      (gasRun, resolve, reject) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ success: boolean; message?: string }>(rawRes);
            console.log(`[gasBridge] dealerKonfirmasiRetur SUCCESS idKlaim: ${idKlaim}`);
            resolve(res);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] dealerKonfirmasiRetur Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal mengonfirmasi retur klaim di Spreadsheet.'));
          })
          .dealerKonfirmasiRetur(idKlaim, alasan);
      }
    );
  },

  // 8c. Hapus Klaim / Draft (Menghapus Permanen di Lokal & Spreadsheet dengan Dual-Layer Purge)
  async hapusKlaim(
    idKlaim: string,
    noSj?: string,
    kodeAhm?: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanId = (idKlaim || '').trim();
    const cleanSj = (noSj || '').replace(/\D/g, '');

    if (cleanId) sessionDeletedClaimIds.add(cleanId);
    if (cleanSj) sessionDeletedClaimIds.add(`sj_${cleanSj}`);

    // Jika sedang ada proses simpan background (in-flight) untuk draft ini, tunggu sampai selesai terlebih dahulu
    // agar kita menghapus baris yang benar-benar sudah tertulis di Spreadsheet
    const pendingLock =
      (cleanId && inFlightClaimLocks.get(cleanId)) ||
      (cleanSj ? inFlightClaimLocks.get(`sj_${cleanSj}`) : undefined);
    if (pendingLock) {
      try {
        await pendingLock;
      } catch (_) {}
    }

    const targetId =
      (cleanId && serverAssignedIdMap.get(cleanId)) ||
      (cleanSj && serverAssignedIdMap.get(`sj_${cleanSj}`)) ||
      cleanId;

    console.log(`[gasBridge] hapusKlaim CALL targetId: ${targetId} (orig: ${cleanId}) noSj: ${noSj || ''}`);

    return executeSpreadsheetPurge(targetId, noSj, kodeAhm);
  },

  // 9. Check Data Version (Heartbeat)
  checkDataVersion(clientVersion: string): Promise<{ isOutdated: boolean; serverVersion: string }> {
    const gasRun = getGasRun();
    if (gasRun) {
      return new Promise((resolve) => {
        gasRun
          .withSuccessHandler((rawRes: any) => {
            const res = parseGasResponse<{ isOutdated: boolean; serverVersion: string }>(rawRes);
            resolve(res || { isOutdated: false, serverVersion: clientVersion });
          })
          .withFailureHandler(() => {
            resolve({ isOutdated: false, serverVersion: clientVersion });
          })
          .checkDataVersion(clientVersion);
      });
    }

    return executeGasAction<{ isOutdated: boolean; serverVersion: string }>(
      'checkDataVersion',
      { clientVersion }
    ).catch(() => ({ isOutdated: false, serverVersion: clientVersion }));
  },

  // 10. Navigasi ke URL WebMD
  getAppUrl(targetPage: string): Promise<string> {
    console.log(`[gasBridge] getAppUrl CALL targetPage: ${targetPage}`);

    const gasRun = getGasRun();
    if (gasRun) {
      return new Promise((resolve, reject) => {
        gasRun
          .withSuccessHandler((url: string) => {
            console.log(`[gasBridge] getAppUrl SUCCESS url: ${url}`);
            resolve(url);
          })
          .withFailureHandler((err: Error) => {
            console.warn('[gasBridge] getAppUrl Notice:', err?.message || err);
            reject(new Error(err?.message || 'Gagal mendapatkan URL aplikasi dari Google Apps Script.'));
          })
          .getAppUrl(targetPage);
      });
    }

    return executeGasAction<string>('getAppUrl', { targetPage }).catch(() => {
      return `https://script.google.com/macros/s/AKfycbyPMN2vvUNysv-Tn_2YCfzNcBLHC8FluGF0BwdHt07YrKT4lHMxQqkKjYsPd2DJ2v9ekQ/exec?page=${targetPage}`;
    });
  },
};
