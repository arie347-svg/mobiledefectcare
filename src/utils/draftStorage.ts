import { ClaimItem } from '../types';

const DRAFT_STORAGE_PREFIX = 'mdc_local_drafts_';
const SUBMITTED_DRAFTS_STORAGE_KEY = 'mdc_submitted_drafts_v1';
const DELETED_CLAIMS_STORAGE_KEY = 'mdc_deleted_claims_v1';
const ACTIVE_WIZARD_DRAFT_KEY = 'mdc_active_wizard_draft_v1';
const MUTATION_LOCK_TTL_MS = 20000; // 20 detik masa tenggang proteksi optimistic lock untuk klaim terkirim
const DELETED_TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 hari proteksi anti-zombie

const IDB_NAME = 'mdc_dealer_local_db';
const IDB_VERSION = 1;
const IDB_STORE_DRAFTS = 'local_drafts';

// Tingkat kematangan status untuk mencegah kemunduran status akibat lag spreadsheet
export const STATUS_PRIORITY: Record<string, number> = {
  'Draft': 1,
  'Dikirim ke MD': 2,
  'Proses di MD': 3,
  'Dikirim ke Dealer': 4,
  'Selesai': 5,
};

export const normalizeSj = (sj?: string): string => {
  return (sj || '').replace(/\D/g, '');
};

/**
 * Generator ID khusus untuk Local Draft (HANYA digunakan di browser/perangkat lokal).
 * TIDAK BOLEH menggunakan prefix CLM- agar terpisah tegas dari Official Claim ID Spreadsheet.
 */
export const generateLocalDraftId = (): string => {
  const rand = Math.floor(100 + Math.random() * 900);
  return `DRAFT-${Date.now()}-${rand}`;
};

/**
 * Generator Official Claim ID (HANYA dipanggil ketika user menekan tombol "Kirim ke MD").
 */
export const generateOfficialClaimId = (): string => {
  return `CLM-${Date.now()}`;
};

export const isLocalDraftIdentifier = (id?: string): boolean => {
  if (!id) return false;
  return id.trim().toUpperCase().startsWith('DRAFT-');
};

export interface LocalDraftEntry extends ClaimItem {
  localDraftId: string;
  createdAt: string;
  updatedAt: string;
  isLocalDraft: boolean;
  submittedClaimId?: string;
  formData?: Record<string, any>;
  isSyncedToServer?: boolean;
  syncedAt?: number;
}

// In-memory mutation lock store (khusus untuk klaim yang sudah dikirim ke MD / Selesai / Retur)
interface MutationLock {
  idKlaim: string;
  cleanNoSj: string;
  status: string;
  timestamp: number;
  claim: ClaimItem;
}

const activeMutationLocks = new Map<string, MutationLock>();

// ============================================================================
// INDEXED-DB ENGINE (PENYIMPANAN PERSISTEN KAPASITAS BESAR UNTUK FOTO BASE64)
// ============================================================================
const openDraftIdb = (): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_DRAFTS)) {
          db.createObjectStore(IDB_STORE_DRAFTS, { keyPath: 'storageKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
};

const syncDraftListToIdb = async (kodeAhm: string, drafts: LocalDraftEntry[]): Promise<void> => {
  if (!kodeAhm) return;
  try {
    const db = await openDraftIdb();
    if (!db) return;
    const tx = db.transaction(IDB_STORE_DRAFTS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_DRAFTS);
    store.put({
      storageKey: `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
      kodeAhm: kodeAhm.trim(),
      updatedAt: Date.now(),
      drafts,
    });
  } catch (_) {}
};

/**
 * Memulihkan draft dari IndexedDB jika localStorage terhapus atau melewati kuota
 */
export const hydrateLocalDraftsFromIdb = async (kodeAhm?: string): Promise<LocalDraftEntry[]> => {
  if (typeof window === 'undefined' || !kodeAhm) return [];
  const key = `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`;
  try {
    const db = await openDraftIdb();
    if (!db) return getAllLocalDrafts(kodeAhm);

    return await new Promise<LocalDraftEntry[]>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_DRAFTS, 'readonly');
        const store = tx.objectStore(IDB_STORE_DRAFTS);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const idbRecord = getReq.result;
          const idbDrafts: LocalDraftEntry[] = Array.isArray(idbRecord?.drafts) ? idbRecord.drafts : [];
          const lsDrafts = getAllLocalDrafts(kodeAhm);

          if (idbDrafts.length === 0) {
            if (lsDrafts.length > 0) {
              void syncDraftListToIdb(kodeAhm, lsDrafts);
            }
            resolve(lsDrafts);
            return;
          }

          // Gabungkan draft dari localStorage dan IndexedDB berdasarkan localDraftId (ambil yang updatedAt terbaru)
          const mergedMap = new Map<string, LocalDraftEntry>();
          for (const item of [...idbDrafts, ...lsDrafts]) {
            const dId = item.localDraftId || item.idKlaim;
            if (!dId) continue;
            if (isClaimDeleted(dId, undefined)) continue;
            if (isDraftAlreadySubmitted(dId).submitted) continue;

            const existing = mergedMap.get(dId);
            if (!existing) {
              mergedMap.set(dId, item);
            } else {
              const tNew = new Date(item.updatedAt || item.rawTimestamp || 0).getTime();
              const tOld = new Date(existing.updatedAt || existing.rawTimestamp || 0).getTime();
              if (tNew >= tOld) {
                mergedMap.set(dId, item);
              }
            }
          }

          const mergedList = Array.from(mergedMap.values()).sort(
            (a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0)
          );

          try {
            localStorage.setItem(key, JSON.stringify(mergedList));
          } catch (_) {}
          resolve(mergedList);
        };
        getReq.onerror = () => resolve(getAllLocalDrafts(kodeAhm));
      } catch (_) {
        resolve(getAllLocalDrafts(kodeAhm));
      }
    });
  } catch (_) {
    return getAllLocalDrafts(kodeAhm);
  }
};

// ============================================================================
// REGISTRI DRAFT YANG SUDAH DIKIRIM KE MD (ANTI-DOUBLE SUBMIT)
// ============================================================================
interface SubmittedDraftRecord {
  localDraftId: string;
  claimId: string;
  status: 'SUBMITTED';
  noSj?: string;
  submittedAt: string;
}

const getSubmittedDraftsMap = (): Record<string, SubmittedDraftRecord> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SUBMITTED_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

/**
 * Mengecek apakah suatu localDraftId sudah pernah berhasil dikirim ke MD (SUBMITTED)
 */
export const isDraftAlreadySubmitted = (
  localDraftId?: string
): { submitted: boolean; claimId?: string } => {
  if (!localDraftId) return { submitted: false };
  const cleanId = localDraftId.trim();
  const map = getSubmittedDraftsMap();
  const entry = map[cleanId];
  if (entry && entry.status === 'SUBMITTED' && entry.claimId) {
    return { submitted: true, claimId: entry.claimId };
  }
  return { submitted: false };
};

/**
 * Menandai local draft sebagai SUBMITTED setelah berhasil dikirim ke MD & masuk Spreadsheet,
 * sekaligus membersihkannya dari daftar draft aktif agar tidak dapat di-submit ulang.
 */
export const clearSubmittedDraft = (
  kodeAhm: string,
  localDraftId: string,
  officialClaimId: string,
  noSj?: string
): void => {
  if (typeof window === 'undefined') return;
  try {
    const cleanDraftId = (localDraftId || '').trim();
    const cleanOfficialId = (officialClaimId || '').trim();

    if (cleanDraftId && cleanOfficialId) {
      const map = getSubmittedDraftsMap();
      map[cleanDraftId] = {
        localDraftId: cleanDraftId,
        claimId: cleanOfficialId,
        status: 'SUBMITTED',
        noSj: normalizeSj(noSj),
        submittedAt: new Date().toISOString(),
      };
      localStorage.setItem(SUBMITTED_DRAFTS_STORAGE_KEY, JSON.stringify(map));
    }

    if (cleanDraftId) {
      deleteLocalDraft(kodeAhm, cleanDraftId);
    }
    saveActiveWizardSession(null);
  } catch (e) {
    console.warn('[DraftStorage] Gagal menandai clearSubmittedDraft:', e);
  }
};

// ============================================================================
// TOMBSTONE REGISTRY (UNTUK KLAIM SERVER YANG DIHAPUS)
// ============================================================================
const getDeletedClaimsMap = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DELETED_CLAIMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const now = Date.now();
    const valid: Record<string, number> = {};
    let changed = false;
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < DELETED_TOMBSTONE_TTL_MS) {
        valid[k] = ts;
      } else {
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(DELETED_CLAIMS_STORAGE_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch (_) {
    return {};
  }
};

export const recordDeletedClaim = (idKlaim?: string, noSj?: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const map = getDeletedClaimsMap();
    const now = Date.now();
    const cleanId = (idKlaim || '').trim();
    const cleanSj = normalizeSj(noSj);

    if (cleanId) {
      map[`id_${cleanId}`] = now;
      activeMutationLocks.delete(cleanId);
    }
    // Hanya catat tombstone SJ jika bukan penghapusan draft lokal murni
    if (cleanSj && !isLocalDraftIdentifier(cleanId)) {
      map[`sj_${cleanSj}`] = now;
      activeMutationLocks.delete(`sj_${cleanSj}`);
    }

    localStorage.setItem(DELETED_CLAIMS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[DraftStorage] Gagal mencatat tombstone hapus klaim:', e);
  }
};

export const unmarkDeletedClaim = (idKlaim?: string, noSj?: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const map = getDeletedClaimsMap();
    const cleanId = (idKlaim || '').trim();
    const cleanSj = normalizeSj(noSj);
    let changed = false;

    if (cleanId && map[`id_${cleanId}`]) {
      delete map[`id_${cleanId}`];
      changed = true;
    }
    if (cleanSj && map[`sj_${cleanSj}`]) {
      delete map[`sj_${cleanSj}`];
      changed = true;
    }
    if (changed) {
      localStorage.setItem(DELETED_CLAIMS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (_) {}
};

export const isClaimDeleted = (idKlaim?: string, noSj?: string): boolean => {
  const map = getDeletedClaimsMap();
  const cleanId = (idKlaim || '').trim();
  const cleanSj = normalizeSj(noSj);

  if (cleanId && map[`id_${cleanId}`]) return true;
  if (!isLocalDraftIdentifier(cleanId) && cleanSj && map[`sj_${cleanSj}`]) return true;
  return false;
};

export const recordMutationLock = (claim: ClaimItem): void => {
  if (!claim || claim.status === 'Draft') return;
  unmarkDeletedClaim(claim.idKlaim, claim.noSj);
  const cleanSj = normalizeSj(claim.noSj);
  const lock: MutationLock = {
    idKlaim: claim.idKlaim,
    cleanNoSj: cleanSj,
    status: claim.status,
    timestamp: Date.now(),
    claim: { ...claim },
  };

  if (claim.idKlaim) {
    activeMutationLocks.set(claim.idKlaim, lock);
  }
  if (cleanSj) {
    activeMutationLocks.set(`sj_${cleanSj}`, lock);
  }
};

// ============================================================================
// CORE LOCAL DRAFT CRUD FUNCTIONS (100% LOCAL STORAGE + INDEXED-DB)
// ============================================================================

const normalizeToLocalDraftEntry = (
  draft: Partial<ClaimItem>,
  existingEntry?: LocalDraftEntry | null
): LocalDraftEntry => {
  const nowIso = new Date().toISOString();
  const resolvedLocalDraftId =
    (draft.localDraftId && isLocalDraftIdentifier(draft.localDraftId) ? draft.localDraftId.trim() : '') ||
    (draft.idKlaim && isLocalDraftIdentifier(draft.idKlaim) ? draft.idKlaim.trim() : '') ||
    existingEntry?.localDraftId ||
    generateLocalDraftId();

  const createdAt = existingEntry?.createdAt || draft.createdAt || nowIso;
  const updatedAt = nowIso;
  const rawTimestamp = Date.now();

  const entry: LocalDraftEntry = {
    idKlaim: resolvedLocalDraftId, // Di state UI menggunakan localDraftId (DRAFT-xxx), BUKAN CLM-xxx
    localDraftId: resolvedLocalDraftId,
    createdAt,
    updatedAt,
    isLocalDraft: true,
    rawTimestamp,
    rawDate: draft.rawDate || existingEntry?.rawDate || nowIso.split('T')[0],
    tgl: draft.tgl || existingEntry?.tgl || '',
    tglSelesai: '',
    status: 'Draft',
    lastStep: draft.lastStep ?? existingEntry?.lastStep ?? 1,
    noSj: draft.noSj ?? existingEntry?.noSj ?? '',
    tglDo: draft.tglDo ?? existingEntry?.tglDo ?? nowIso.split('T')[0],
    tglPeriksa: draft.tglPeriksa ?? existingEntry?.tglPeriksa ?? nowIso.split('T')[0],
    kodeAhm: draft.kodeAhm ?? existingEntry?.kodeAhm ?? '',
    kodeDealer: draft.kodeDealer ?? existingEntry?.kodeDealer ?? '',
    namaDealer: draft.namaDealer ?? existingEntry?.namaDealer ?? '',
    sopirPJ: draft.sopirPJ ?? existingEntry?.sopirPJ ?? '',
    nopolPJ: draft.nopolPJ ?? existingEntry?.nopolPJ ?? '',
    transporterPJ: draft.transporterPJ ?? existingEntry?.transporterPJ ?? '',
    parafSopirPJ: draft.parafSopirPJ ?? existingEntry?.parafSopirPJ ?? '',
    fotoSopirPJ: draft.fotoSopirPJ ?? existingEntry?.fotoSopirPJ ?? '',
    metodeKembali: draft.metodeKembali ?? existingEntry?.metodeKembali ?? '',
    sopirKembali: draft.sopirKembali ?? existingEntry?.sopirKembali ?? '',
    nopolKembali: draft.nopolKembali ?? existingEntry?.nopolKembali ?? '',
    transporterKembali: draft.transporterKembali ?? existingEntry?.transporterKembali ?? '',
    parafUser: draft.parafUser ?? existingEntry?.parafUser ?? '',
    draftDeadline:
      existingEntry?.draftDeadline ||
      draft.draftDeadline ||
      new Date(Date.now() + 24 * 3600000).toISOString(),
    kontakPengurusPJ: draft.kontakPengurusPJ ?? existingEntry?.kontakPengurusPJ ?? '',
    kontakPengurusKembali: draft.kontakPengurusKembali ?? existingEntry?.kontakPengurusKembali ?? '',
    kontakRepairman: draft.kontakRepairman ?? existingEntry?.kontakRepairman ?? '',
    kontakKaGudang: draft.kontakKaGudang ?? existingEntry?.kontakKaGudang ?? '',
    noHpPdi: draft.noHpPdi ?? existingEntry?.noHpPdi ?? '',
    items: Array.isArray(draft.items) ? draft.items : existingEntry?.items || [],
  };

  // Simpan struktur formData eksplisit sesuai requirement arsitektur
  entry.formData = {
    noSj: entry.noSj,
    tglDo: entry.tglDo,
    tglPeriksa: entry.tglPeriksa,
    sopirPJ: entry.sopirPJ,
    nopolPJ: entry.nopolPJ,
    transporterPJ: entry.transporterPJ,
    parafSopirPJ: entry.parafSopirPJ,
    fotoSopirPJ: entry.fotoSopirPJ,
    metodeKembali: entry.metodeKembali,
    sopirKembali: entry.sopirKembali,
    nopolKembali: entry.nopolKembali,
    transporterKembali: entry.transporterKembali,
    parafUser: entry.parafUser,
    lastStep: entry.lastStep,
    items: entry.items,
  };

  return entry;
};

/**
 * 1. getAllLocalDrafts: Mengambil seluruh draft lokal milik dealer dari localStorage.
 * Draft lokal tetap tersedia selama belum dihapus atau belum dikirim ke MD (SUBMITTED).
 */
export const getAllLocalDrafts = (kodeAhm?: string): LocalDraftEntry[] => {
  if (typeof window === 'undefined' || !kodeAhm) return [];
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    return list
      .filter((item: LocalDraftEntry) => {
        if (!item) return false;
        const dId = item.localDraftId || item.idKlaim;
        if (!dId) return false;
        if (String(item.status || '').toUpperCase() === 'SUBMITTED') return false;
        if (isDraftAlreadySubmitted(dId).submitted) return false;
        if (isClaimDeleted(dId, undefined)) return false;
        return true;
      })
      .map((item: LocalDraftEntry) => {
        const dId =
          item.localDraftId && isLocalDraftIdentifier(item.localDraftId)
            ? item.localDraftId
            : isLocalDraftIdentifier(item.idKlaim)
            ? item.idKlaim
            : `DRAFT-${item.rawTimestamp || Date.now()}`;
        return {
          ...item,
          idKlaim: dId,
          localDraftId: dId,
          isLocalDraft: true,
          status: 'Draft',
        };
      });
  } catch (e) {
    console.warn('[DraftStorage] Gagal membaca daftar draft lokal:', e);
    return [];
  }
};

// Alias untuk kompatibilitas dengan pemanggil yang sudah ada
export const getLocalDrafts = getAllLocalDrafts;

/**
 * 2. getLocalDraft: Mengambil satu draft lokal spesifik berdasarkan localDraftId.
 */
export const getLocalDraft = (kodeAhm: string, localDraftId: string): LocalDraftEntry | null => {
  if (!kodeAhm || !localDraftId) return null;
  const cleanTarget = localDraftId.trim();
  const list = getAllLocalDrafts(kodeAhm);
  return (
    list.find((d) => d.localDraftId === cleanTarget || d.idKlaim === cleanTarget) || null
  );
};

/**
 * 3. createLocalDraft: Membuat draft lokal baru dengan localDraftId unik (DRAFT-xxx) tanpa Id Klaim Spreadsheet.
 */
export const createLocalDraft = (
  kodeAhm: string,
  draftData: Partial<ClaimItem>
): LocalDraftEntry => {
  const newDraftId =
    draftData.localDraftId && isLocalDraftIdentifier(draftData.localDraftId)
      ? draftData.localDraftId
      : generateLocalDraftId();

  const entry = normalizeToLocalDraftEntry(
    {
      ...draftData,
      localDraftId: newDraftId,
      idKlaim: newDraftId,
    },
    null
  );

  saveLocalDraft(kodeAhm, entry);
  return entry;
};

/**
 * 4. updateLocalDraft: Memperbarui draft lokal yang sudah ada berdasarkan localDraftId.
 * TIDAK membuat draft baru dan TIDAK mengubah localDraftId.
 */
export const updateLocalDraft = (
  kodeAhm: string,
  localDraftId: string,
  updatedData: Partial<ClaimItem>
): LocalDraftEntry => {
  const cleanDraftId = (localDraftId || '').trim() || generateLocalDraftId();
  const currentList = getAllLocalDrafts(kodeAhm);
  const existing = currentList.find(
    (d) => d.localDraftId === cleanDraftId || d.idKlaim === cleanDraftId
  );

  const updatedEntry = normalizeToLocalDraftEntry(
    {
      ...updatedData,
      localDraftId: cleanDraftId,
      idKlaim: cleanDraftId,
    },
    existing || null
  );

  const remaining = currentList.filter(
    (d) => d.localDraftId !== cleanDraftId && d.idKlaim !== cleanDraftId
  );
  const nextList = [updatedEntry, ...remaining];

  if (typeof window !== 'undefined' && kodeAhm) {
    try {
      unmarkDeletedClaim(cleanDraftId, updatedEntry.noSj);
      localStorage.setItem(
        `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
        JSON.stringify(nextList)
      );
    } catch (e) {
      console.warn('[DraftStorage] Kuota localStorage penuh, menyimpan ke IndexedDB:', e);
    }
    void syncDraftListToIdb(kodeAhm, nextList);
  }

  return updatedEntry;
};

/**
 * 5. saveLocalDraft: Menyimpan atau memperbarui draft klaim ke penyimpanan lokal perangkat (0ms).
 * Jika localDraftId sudah ada di daftar draft lokal, maka otomatis melakukan UPDATE (bukan INSERT baru).
 */
export const saveLocalDraft = (
  kodeAhm: string,
  draft: ClaimItem,
  _isSyncedToServer = false
): LocalDraftEntry => {
  const targetDraftId =
    (draft.localDraftId && isLocalDraftIdentifier(draft.localDraftId) ? draft.localDraftId : '') ||
    (draft.idKlaim && isLocalDraftIdentifier(draft.idKlaim) ? draft.idKlaim : '') ||
    generateLocalDraftId();

  return updateLocalDraft(kodeAhm, targetDraftId, {
    ...draft,
    localDraftId: targetDraftId,
    idKlaim: targetDraftId,
  });
};

export const markDraftSyncedToServer = (
  _kodeAhm: string,
  _idKlaim: string,
  _noSj?: string
): void => {
  // No-op untuk konsep baru karena Draft tidak pernah disinkronkan ke server
};

/**
 * 6. deleteLocalDraft: Menghapus draft klaim dari localStorage & IndexedDB berdasarkan localDraftId.
 */
export const deleteLocalDraft = (kodeAhm: string, localDraftIdOrNoSj: string): void => {
  if (typeof window === 'undefined' || !kodeAhm || !localDraftIdOrNoSj) return;
  try {
    const cleanTarget = localDraftIdOrNoSj.trim();
    const cleanSj = isLocalDraftIdentifier(cleanTarget) ? '' : normalizeSj(cleanTarget);
    const current = getAllLocalDrafts(kodeAhm);
    const updated = current.filter((d) => {
      if (d.localDraftId === cleanTarget || d.idKlaim === cleanTarget) return false;
      if (cleanSj && normalizeSj(d.noSj) === cleanSj) return false;
      return true;
    });
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
      JSON.stringify(updated)
    );
    void syncDraftListToIdb(kodeAhm, updated);

    const activeWizard = getActiveWizardSession(kodeAhm);
    if (
      activeWizard &&
      (activeWizard.localDraftId === cleanTarget || activeWizard.idKlaim === cleanTarget)
    ) {
      saveActiveWizardSession(null);
    }
  } catch (e) {
    console.warn('[DraftStorage] Gagal menghapus draft lokal:', e);
  }
};

// Alias untuk kompatibilitas dengan pemanggil lama
export const removeLocalDraft = deleteLocalDraft;

// ============================================================================
// SESSION RECOVERY UNTUK FORM WIZARD AKTIF (TAHAN REFRESH & KAMERA RELOAD)
// ============================================================================
export const saveActiveWizardSession = (draft: ClaimItem | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!draft) {
      sessionStorage.removeItem(ACTIVE_WIZARD_DRAFT_KEY);
      localStorage.removeItem(ACTIVE_WIZARD_DRAFT_KEY);
      return;
    }
    const serialized = JSON.stringify(draft);
    sessionStorage.setItem(ACTIVE_WIZARD_DRAFT_KEY, serialized);
    localStorage.setItem(ACTIVE_WIZARD_DRAFT_KEY, serialized);
  } catch (_) {}
};

export const getActiveWizardSession = (kodeAhm?: string): ClaimItem | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem(ACTIVE_WIZARD_DRAFT_KEY) ||
      localStorage.getItem(ACTIVE_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimItem;
    if (!parsed) return null;
    if (kodeAhm && parsed.kodeAhm && parsed.kodeAhm.trim() !== kodeAhm.trim()) {
      return null;
    }
    const dId = parsed.localDraftId || parsed.idKlaim;
    if (dId && isDraftAlreadySubmitted(dId).submitted) {
      return null;
    }
    // Jika draft tersebut ada versi terbarunya di getAllLocalDrafts, ambil dari getAllLocalDrafts
    if (kodeAhm && dId) {
      const stored = getLocalDraft(kodeAhm, dId);
      if (stored) return stored;
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

// ============================================================================
// MERGE ENGINE: MENGGABUNGKAN LOCAL DRAFTS + REMOTE SUBMITTED CLAIMS
// ============================================================================
/**
 * Menggabungkan seluruh Draft Lokal (dari perangkat browser) dengan klaim resmi yang sudah dikirim ke Spreadsheet.
 * PENTING:
 * - Draft Lokal TIDAK PERNAH dihapus otomatis oleh proses polling / refresh.
 * - Baris berstatus 'Draft' dari Spreadsheet (jika ada sisa data lama) diabaikan karena Draft hanya disimpan di lokal.
 */
export const mergeClaimsWithLocalDrafts = (
  remoteClaims: ClaimItem[],
  kodeAhm?: string
): ClaimItem[] => {
  if (!kodeAhm) return remoteClaims || [];

  const now = Date.now();
  for (const [key, lock] of activeMutationLocks.entries()) {
    if (now - lock.timestamp > MUTATION_LOCK_TTL_MS) {
      activeMutationLocks.delete(key);
    }
  }

  // 1. Ambil seluruh Draft Lokal dari perangkat (Local-Only Drafts)
  const localDrafts = getAllLocalDrafts(kodeAhm);

  // 2. Saring klaim remote dari Spreadsheet:
  // Hanya tampilkan klaim resmi yang sudah dikirim ke MD (status !== 'Draft') dan belum dihapus
  const cleanRemoteList = (remoteClaims || []).filter((item) => {
    if (!item) return false;
    const st = (item.status || '').trim().toUpperCase();
    const kd = String(item.kodeAhm || '').trim().toUpperCase();
    if (st === 'DIHAPUS' || kd === 'DELETED') return false;
    // Draft hanya boleh berasal dari penyimpanan lokal perangkat, bukan dari Spreadsheet
    if (st === 'DRAFT') return false;
    return !isClaimDeleted(item.idKlaim, item.noSj);
  });

  // 3. Terapkan Proteksi Mutation Lock pada klaim resmi remote (Dikirim ke MD / Selesai / Retur)
  const guardedRemoteList = cleanRemoteList.map((remoteItem) => {
    const cleanSj = normalizeSj(remoteItem.noSj);
    const lock =
      activeMutationLocks.get(remoteItem.idKlaim) ||
      (cleanSj ? activeMutationLocks.get(`sj_${cleanSj}`) : undefined);

    if (lock) {
      const remotePriority = STATUS_PRIORITY[remoteItem.status] || 0;
      const lockedPriority = STATUS_PRIORITY[lock.status] || 0;

      if (lockedPriority > remotePriority) {
        return {
          ...remoteItem,
          ...lock.claim,
          idKlaim: remoteItem.idKlaim || lock.claim.idKlaim,
          status: lock.status,
          tglSelesai: lock.claim.tglSelesai || remoteItem.tglSelesai,
          mdValidasiRepairman: lock.claim.mdValidasiRepairman || remoteItem.mdValidasiRepairman,
        };
      }
    }
    return remoteItem;
  });

  // 4. Masukkan klaim baru yang baru saja dikirim ke MD (status !== 'Draft') tapi belum terindeks di getRecentClaims
  const activeMutatedUnlisted: ClaimItem[] = [];
  for (const lock of activeMutationLocks.values()) {
    if (lock.status === 'Draft') continue;
    if (isClaimDeleted(lock.idKlaim, lock.cleanNoSj)) continue;
    const exists = guardedRemoteList.some(
      (c) => c.idKlaim === lock.idKlaim || (lock.cleanNoSj && normalizeSj(c.noSj) === lock.cleanNoSj)
    );
    if (!exists) {
      activeMutatedUnlisted.push(lock.claim);
    }
  }

  // 5. Urutkan Draft Lokal berdasarkan waktu update terbaru, diikuti klaim resmi Spreadsheet
  const sortedLocalDrafts = [...localDrafts].sort(
    (a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0)
  );

  const finalMerged = [...sortedLocalDrafts, ...activeMutatedUnlisted, ...guardedRemoteList];

  // 6. Deduplikasi berdasarkan identifier unik masing-masing (localDraftId untuk Draft, idKlaim untuk Klaim Resmi)
  const seenKeys = new Set<string>();
  return finalMerged.filter((item) => {
    const uniqueKey = item.isLocalDraft
      ? `local_${item.localDraftId || item.idKlaim}`
      : `remote_${item.idKlaim}`;
    if (seenKeys.has(uniqueKey)) return false;
    seenKeys.add(uniqueKey);
    return true;
  });
};
