import { ClaimItem, ClaimStatusNotification } from '../types';

const SNAPSHOT_STORAGE_KEY = 'mdc_claim_status_snapshots';
const NOTIF_STORAGE_KEY = 'mdc_claim_notifications';
const MAX_NOTIFICATIONS = 30;

/**
 * Membaca riwayat notifikasi dari localStorage
 */
export function getSavedNotifications(): ClaimStatusNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Menyimpan daftar notifikasi ke localStorage
 */
export function saveNotifications(notifications: ClaimStatusNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (_) {}
}

/**
 * Meminta izin Web Notification dari browser
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (_) {
      return false;
    }
  }
  return false;
}

/**
 * Mengirim browser push notification jika diizinkan
 */
export function sendBrowserPushNotification(notif: ClaimStatusNotification): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const title = `Status Klaim Diperbarui (${notif.idKlaim || notif.noSj})`;
    const options: NotificationOptions = {
      body: `Status klaim Anda telah berubah dari "${notif.oldStatus}" menjadi "${notif.newStatus}".`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `claim-status-${notif.idKlaim}`,
    };
    new Notification(title, options);
  } catch (err) {
    console.warn('[Notification] Gagal memunculkan Web Notification:', err);
  }
}

/**
 * Mendeteksi perubahan status klaim dengan membandingkan daftar klaim terbaru
 * terhadap snapshot sebelumnya.
 */
export function detectStatusChanges(freshClaims: ClaimItem[]): ClaimStatusNotification[] {
  if (typeof window === 'undefined' || !Array.isArray(freshClaims) || freshClaims.length === 0) {
    return [];
  }

  let prevSnapshots: Record<string, string> = {};
  const isFirstLoad = !localStorage.getItem(SNAPSHOT_STORAGE_KEY);

  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (raw) {
      prevSnapshots = JSON.parse(raw);
    }
  } catch (_) {
    prevSnapshots = {};
  }

  // Jika ini pertama kali aplikasi dibuka (belum ada snapshot sebelumnya),
  // cukup inisialisasi snapshot tanpa menimbulkan notifikasi palsu
  if (isFirstLoad || Object.keys(prevSnapshots).length === 0) {
    const initialMap: Record<string, string> = {};
    freshClaims.forEach((c) => {
      if (c.idKlaim) {
        initialMap[c.idKlaim] = c.status || 'Draft';
      }
    });
    try {
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(initialMap));
    } catch (_) {}
    return [];
  }

  const newChanges: ClaimStatusNotification[] = [];
  const updatedMap: Record<string, string> = { ...prevSnapshots };

  freshClaims.forEach((claim) => {
    if (!claim.idKlaim) return;

    const oldStatus = prevSnapshots[claim.idKlaim];
    const currentStatus = claim.status || 'Draft';

    // Status berubah untuk klaim yang sudah pernah tercatat
    if (oldStatus && oldStatus !== currentStatus) {
      const notifItem: ClaimStatusNotification = {
        id: `${claim.idKlaim}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        idKlaim: claim.idKlaim,
        noSj: claim.noSj || claim.idKlaim,
        oldStatus,
        newStatus: currentStatus,
        timestamp: Date.now(),
        read: false,
      };

      newChanges.push(notifItem);
      sendBrowserPushNotification(notifItem);
    }

    // Selalu perbarui status terakhir di snapshot
    updatedMap[claim.idKlaim] = currentStatus;
  });

  // Simpan snapshot terbaru
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(updatedMap));
  } catch (_) {}

  return newChanges;
}

/**
 * Format waktu relatif yang ringkas dan ramah (Bahasa Indonesia)
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
