import React, { useEffect } from 'react';
import { Bell, ArrowRight, X, ExternalLink } from 'lucide-react';
import { ClaimStatusNotification } from '../types';

interface NotificationToastProps {
  notification: ClaimStatusNotification | null;
  onDismiss: () => void;
  onSelectClaim: (idKlaim: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onDismiss,
  onSelectClaim,
}) => {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000); // Tutup otomatis setelah 8 detik
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) return null;

  const isFinish = notification.newStatus.toLowerCase().includes('selesai');

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[70] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-amber-300/80 p-3.5 flex items-start gap-3 relative overflow-hidden">
        {/* Accent Bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1.5 ${
            isFinish ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />

        {/* Icon */}
        <div
          className={`p-2 rounded-xl flex-shrink-0 ${
            isFinish ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Bell className="w-4 h-4 animate-bounce" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <h4 className="text-xs font-bold text-gray-900">Status Klaim Diperbarui</h4>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              Live
            </span>
          </div>

          <p className="text-[11px] text-gray-600 mb-1.5 leading-snug break-words">
            Klaim <strong className="text-gray-900 font-bold break-all">{notification.idKlaim || notification.noSj}</strong>:
          </p>

          <div className="flex items-center gap-1.5 text-[10px] font-semibold flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 break-words">
              {notification.oldStatus}
            </span>
            <ArrowRight className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
            <span
              className={`px-1.5 py-0.5 rounded border break-words ${
                isFinish
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {notification.newStatus}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectClaim(notification.idKlaim);
              onDismiss();
            }}
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
          >
            <span>Buka Detail Klaim</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
