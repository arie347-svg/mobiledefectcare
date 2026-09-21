import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, ArrowRight, ExternalLink } from 'lucide-react';
import { ClaimStatusNotification } from '../types';
import { formatTimeAgo, requestNotificationPermission } from '../utils/notificationHelper';

interface NotificationCenterProps {
  notifications: ClaimStatusNotification[];
  unreadCount: number;
  onMarkAllAsRead: () => void;
  onSelectNotification: (idKlaim: string) => void;
  onClearAll: () => void;
}

const getStatusBadgeClass = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes('selesai')) return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
  if (s.includes('proses')) return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
  if (s.includes('kirim')) return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
  if (s.includes('tolak')) return 'bg-rose-500/15 text-rose-700 border-rose-500/30';
  return 'bg-gray-500/15 text-gray-700 border-gray-400/30';
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  unreadCount,
  onMarkAllAsRead,
  onSelectNotification,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      // Minta izin Web Notification secara halus jika belum
      requestNotificationPermission();
    }
    setIsOpen((prev) => !prev);
  };

  const handleItemClick = (idKlaim: string) => {
    setIsOpen(false);
    onSelectNotification(idKlaim);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Tombol Lonceng Notifikasi */}
      <button
        type="button"
        onClick={handleToggle}
        title="Pemberitahuan Status Klaim"
        className="relative p-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 border border-white/20 transition-all text-white/90 hover:text-white flex-shrink-0 cursor-pointer shadow-xs"
        aria-label="Notifikasi Klaim"
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-amber-400 text-red-950 text-[9px] font-black rounded-full flex items-center justify-center border-2 border-red-700 shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Notifikasi */}
      {isOpen && (
        <div className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-full mt-0 sm:mt-2 w-[calc(100vw-24px)] sm:w-96 max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 z-[60] text-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[78vh]">
          {/* Header Popover */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-red-600" />
              <h3 className="text-xs font-bold text-gray-800">Notifikasi Status Klaim</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 bg-red-100 text-red-700 font-bold rounded-full">
                  {unreadCount} baru
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllAsRead}
                  title="Tandai semua sudah dibaca"
                  className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-200/60 text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                  <span>Dibaca</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  title="Hapus riwayat notifikasi"
                  className="p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 text-[10px] cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* List Notifikasi */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
            {notifications.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2 stroke-[1.5]" />
                <p className="text-xs font-medium text-gray-500">Belum ada perubahan status klaim</p>
                <p className="text-[10.5px] text-gray-400 mt-0.5">
                  Anda akan diberi tahu secara otomatis saat status diubah di spreadsheet.
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item.idKlaim)}
                  className={`p-3 text-left transition-colors cursor-pointer hover:bg-gray-50 flex items-start gap-2.5 ${
                    !item.read ? 'bg-amber-50/50' : 'bg-white'
                  }`}
                >
                  {/* Status Indicator Dot */}
                  <div className="mt-1 flex-shrink-0">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        !item.read ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-gray-300'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-gray-900 break-all leading-tight">
                        {item.idKlaim || `No. SJ: ${item.noSj}`}
                      </span>
                      <span className="text-[9.5px] text-gray-400 flex-shrink-0 ml-1">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </div>

                    {/* Perubahan Status: Status Lama -> Status Baru */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] my-1">
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[9.5px] font-semibold ${getStatusBadgeClass(
                          item.oldStatus
                        )}`}
                      >
                        {item.oldStatus}
                      </span>
                      <ArrowRight className="w-2.5 h-2.5 text-gray-400" />
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${getStatusBadgeClass(
                          item.newStatus
                        )}`}
                      >
                        {item.newStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium hover:underline mt-1">
                      <span>Lihat Rincian Klaim</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
