import { ClaimItem } from '../types';

const DRAFT_STORAGE_PREFIX = 'mdc_local_drafts_';
const DELETED_CLAIMS_STORAGE_KEY = 'mdc_deleted_claims_v1';
const MUTATION_LOCK_TTL_MS = 15000; // 15 detik masa tenggang proteksi optimistic lock
const DELETED_TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 hari proteksi anti-zombie
const UNSYNCED_DRAFT_GRACE_MS = 45000; // 45 detik masa tenggang draft baru saat sinkronisasi latar belakang

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

interface LocalDraftEntry extends ClaimItem {
  isSyncedToServer?: boolean;
  syncedAt?: number;
}

// In-memory mutation lock store
interface MutationLock {
  idKlaim: string;
  cleanNoSj: string;
  status: string;
  timestamp: number;
  claim: ClaimItem;
}

const activeMutationLocks = new Map<string, MutationLock>();

/**
 * Membaca daftar klaim yang telah dihapus (Tombstone Registry) dari localStorage
 */
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

/**
 * Mencatat ID Klaim / Nomor SJ ke dalam daftar hitam (Tombstone) agar tidak pernah hidup kembali (Anti-Zombie)
 */
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
    if (cleanSj) {
      map[`sj_${cleanSj}`] = now;
      activeMutationLocks.delete(`sj_${cleanSj}`);
    }

    localStorage.setItem(DELETED_CLAIMS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[DraftStorage] Gagal mencatat tombstone hapus klaim:', e);
  }
};

/**
 * Menghapus tanda tombstone jika pengguna secara eksplisit membuat ulang klaim dengan Nomor SJ yang sama
 */
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

/**
 * Mengecek apakah suatu klaim sudah pernah dihapus oleh pengguna
 */
export const isClaimDeleted = (idKlaim?: string, noSj?: string): boolean => {
  const map = getDeletedClaimsMap();
  const cleanId = (idKlaim || '').trim();
  const cleanSj = normalizeSj(noSj);

  if (cleanId && map[`id_${cleanId}`]) return true;
  if (cleanSj && map[`sj_${cleanSj}`]) return true;
  return false;
};

/**
 * Mencatat mutasi lokal (Kirim ke MD, Draft, Selesai, Retur) agar terproteksi dari snapshot lama server
 */
export const recordMutationLock = (claim: ClaimItem): void => {
  if (!claim) return;
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

/**
 * Mengambil daftar draft klaim lokal berdasarkan kode AHM dealer.
 * Otomatis menyaring draft yang telah melewati batas 24 jam atau telah dihapus.
 */
export const getLocalDrafts = (kodeAhm?: string): LocalDraftEntry[] => {
  if (typeof window === 'undefined' || !kodeAhm) return [];
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    const now = Date.now();
    return list.filter((item: LocalDraftEntry) => {
      if (isClaimDeleted(item.idKlaim, item.noSj)) return false;
      if (!item.draftDeadline) return true;
      const deadline = new Date(item.draftDeadline).getTime();
      return isNaN(deadline) || deadline > now;
    });
  } catch (e) {
    console.warn('[DraftStorage] Gagal membaca draft lokal:', e);
    return [];
  }
};

/**
 * Menyimpan atau memperbarui draft klaim ke penyimpanan lokal browser (0ms).
 */
export const saveLocalDraft = (kodeAhm: string, draft: ClaimItem, isSyncedToServer = false): void => {
  if (typeof window === 'undefined' || !kodeAhm) return;
  try {
    unmarkDeletedClaim(draft.idKlaim, draft.noSj);
    recordMutationLock(draft);
    const cleanDraftSj = normalizeSj(draft.noSj);
    const current = getLocalDrafts(kodeAhm);
    const filtered = current.filter(
      (d) => d.idKlaim !== draft.idKlaim && normalizeSj(d.noSj) !== cleanDraftSj
    );
    const entry: LocalDraftEntry = {
      ...draft,
      rawTimestamp: draft.rawTimestamp || Date.now(),
      isSyncedToServer,
      syncedAt: isSyncedToServer ? Date.now() : undefined,
    };
    const updated = [entry, ...filtered];
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
      JSON.stringify(updated)
    );
  } catch (e) {
    console.warn('[DraftStorage] Gagal menyimpan draft lokal:', e);
  }
};

/**
 * Menandai bahwa draft lokal telah berhasil disinkronkan ke server/Spreadsheet.
 * Dengan penanda ini, jika di kemudian hari data tersebut dihapus dari Spreadsheet,
 * maka aplikasi tahu bahwa draft tersebut memang sudah dihapus (bukan draft baru yang belum terkirim).
 */
export const markDraftSyncedToServer = (kodeAhm: string, idKlaim: string, noSj?: string): void => {
  if (typeof window === 'undefined' || !kodeAhm) return;
  try {
    const cleanSj = normalizeSj(noSj);
    const current = getLocalDrafts(kodeAhm);
    const updated = current.map((d) => {
      if (d.idKlaim === idKlaim || (cleanSj && normalizeSj(d.noSj) === cleanSj)) {
        return {
          ...d,
          idKlaim: idKlaim || d.idKlaim,
          isSyncedToServer: true,
          syncedAt: Date.now(),
        };
      }
      return d;
    });
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
      JSON.stringify(updated)
    );
  } catch (_) {}
};

/**
 * Menghapus draft klaim dari penyimpanan lokal browser saat klaim dikirim ke MD, selesai, atau dihapus.
 */
export const removeLocalDraft = (kodeAhm: string, idKlaimOrNoSj: string): void => {
  if (typeof window === 'undefined' || !kodeAhm || !idKlaimOrNoSj) return;
  try {
    const cleanTarget = normalizeSj(idKlaimOrNoSj);
    const current = getLocalDrafts(kodeAhm);
    const updated = current.filter((d) => {
      if (d.idKlaim === idKlaimOrNoSj) return false;
      if (cleanTarget && normalizeSj(d.noSj) === cleanTarget) return false;
      return true;
    });
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${kodeAhm.trim()}`,
      JSON.stringify(updated)
    );
  } catch (e) {
    console.warn('[DraftStorage] Gagal menghapus draft lokal:', e);
  }
};

/**
 * Menggabungkan riwayat klaim dari spreadsheet dengan proteksi Anti-Rebound, Anti-Flicker & Anti-Zombie.
 * Memastikan data yang sudah dihapus (di HP maupun di Spreadsheet) tidak pernah muncul kembali.
 */
export const mergeClaimsWithLocalDrafts = (
  remoteClaims: ClaimItem[],
  kodeAhm?: string
): ClaimItem[] => {
  if (!kodeAhm) return remoteClaims || [];

  const now = Date.now();
  // Bersihkan lock yang sudah expired (> 15 detik)
  for (const [key, lock] of activeMutationLocks.entries()) {
    if (now - lock.timestamp > MUTATION_LOCK_TTL_MS) {
      activeMutationLocks.delete(key);
    }
  }

  const localDrafts = getLocalDrafts(kodeAhm);
  // Saring klaim remote agar klaim yang baru saja dihapus di HP atau bertanda DIHAPUS tidak muncul lagi
  const cleanRemoteList = (remoteClaims || []).filter((item) => {
    if (!item) return false;
    const st = (item.status || '').toUpperCase();
    const kd = String(item.kodeAhm || '').toUpperCase();
    if (st === 'DIHAPUS' || kd === 'DELETED') return false;
    return !isClaimDeleted(item.idKlaim, item.noSj);
  });

  // 1. Terapkan Proteksi Mutation Lock pada data remote
  const guardedRemoteList = cleanRemoteList.map((remoteItem) => {
    const cleanSj = normalizeSj(remoteItem.noSj);
    const lock =
      activeMutationLocks.get(remoteItem.idKlaim) ||
      (cleanSj ? activeMutationLocks.get(`sj_${cleanSj}`) : undefined);

    if (lock) {
      const remotePriority = STATUS_PRIORITY[remoteItem.status] || 0;
      const lockedPriority = STATUS_PRIORITY[lock.status] || 0;

      // Jika data server membawa status yang lebih rendah ATAU sedang meng-update Draft yang sama (lockedPriority === 1),
      // pertahankan data lokal terbaru milik pengguna agar editan Draft tidak tertimpa data lama server
      if (lockedPriority > remotePriority || (lockedPriority === remotePriority && lockedPriority === 1)) {
        return {
          ...remoteItem,
          ...lock.claim,
          idKlaim: lock.claim.idKlaim || remoteItem.idKlaim,
          status: lock.status,
          tglSelesai: lock.claim.tglSelesai || remoteItem.tglSelesai,
          mdValidasiRepairman: lock.claim.mdValidasiRepairman || remoteItem.mdValidasiRepairman,
        };
      }
    }
    return remoteItem;
  });

  // 2. Rekonsiliasi Draft Lokal terhadap Data Server (Anti-Zombie Re-hydration)
  const remoteSjMap = new Set(guardedRemoteList.map((c) => normalizeSj(c.noSj)).filter(Boolean));
  const remoteIdMap = new Set(guardedRemoteList.map((c) => c.idKlaim));
  const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const validLocalDrafts = localDrafts.filter((ld) => {
    const cleanSj = normalizeSj(ld.noSj);
    const existsInRemote = (cleanSj && remoteSjMap.has(cleanSj)) || remoteIdMap.has(ld.idKlaim);
    const hasActiveLock =
      activeMutationLocks.has(ld.idKlaim) ||
      (cleanSj ? activeMutationLocks.has(`sj_${cleanSj}`) : false);

    if (existsInRemote) {
      // Jika sudah ada di respon server dan tidak sedang dalam proses edit aktif (atau sudah synced),
      // bersihkan dari localStorage karena sudah diwakili oleh guardedRemoteList
      if (ld.isSyncedToServer || !hasActiveLock) {
        removeLocalDraft(kodeAhm, ld.idKlaim);
        if (cleanSj) removeLocalDraft(kodeAhm, cleanSj);
      }
      return false;
    }

    // Jika TIDAK ADA di respon server:
    // Cek apakah draft ini sedang berada dalam masa tenggang mutasi baru (< 15 detik)
    if (hasActiveLock) {
      return true;
    }

    // Jika draft ini sebelumnya sudah pernah tersinkron ke server (isSyncedToServer === true)
    // atau umurnya sudah > 45 detik saat kondisi online namun tidak ditemukan lagi di server,
    // berarti data tersebut SUDAH DIHAPUS di Spreadsheet/Server -> Hapus permanen dari localStorage!
    const draftAge = now - (ld.rawTimestamp || 0);
    if (ld.isSyncedToServer || (isOnlineNow && draftAge > UNSYNCED_DRAFT_GRACE_MS)) {
      removeLocalDraft(kodeAhm, ld.idKlaim);
      if (cleanSj) removeLocalDraft(kodeAhm, cleanSj);
      return false;
    }

    return true;
  });

  // 3. Masukkan mutasi baru yang belum muncul sama sekali di respon server remote
  const activeMutatedUnlisted: ClaimItem[] = [];
  for (const lock of activeMutationLocks.values()) {
    if (isClaimDeleted(lock.idKlaim, lock.cleanNoSj)) continue;
    const exists = guardedRemoteList.some(
      (c) => c.idKlaim === lock.idKlaim || (lock.cleanNoSj && normalizeSj(c.noSj) === lock.cleanNoSj)
    );
    const inDrafts = validLocalDrafts.some(
      (d) => d.idKlaim === lock.idKlaim || (lock.cleanNoSj && normalizeSj(d.noSj) === lock.cleanNoSj)
    );
    if (!exists && !inDrafts && lock.status !== 'Draft') {
      activeMutatedUnlisted.push(lock.claim);
    }
  }

  // Gabungkan: Draft Lokal yang baru dibuat + Mutasi aktif belum terindeks + Data Remote Terproteksi
  const finalMerged = [...validLocalDrafts, ...activeMutatedUnlisted, ...guardedRemoteList];

  // Deduplikasi final berdasarkan idKlaim dan noSj
  const seenIds = new Set<string>();
  const seenSjs = new Set<string>();

  return finalMerged.filter((item) => {
    if (isClaimDeleted(item.idKlaim, item.noSj)) return false;
    const cleanSj = normalizeSj(item.noSj);
    if (item.idKlaim && seenIds.has(item.idKlaim)) return false;
    if (cleanSj && seenSjs.has(cleanSj)) return false;

    if (item.idKlaim) seenIds.add(item.idKlaim);
    if (cleanSj) seenSjs.add(cleanSj);
    return true;
  });
};

