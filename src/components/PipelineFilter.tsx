import React from 'react';
import { DashboardStats } from '../types';
import { FileEdit, Send, Wrench, Truck, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PipelineFilterProps {
  stats: DashboardStats;
  activeFilter: string;
  onFilterChange: (status: string) => void;
}

export const PipelineFilter: React.FC<PipelineFilterProps> = ({
  stats,
  activeFilter,
  onFilterChange,
}) => {
  const totalCount = stats.draft + stats.kirimMD + stats.prosesMD + stats.kirimDealer + stats.selesai;

  const cards = [
    {
      id: 'Draft',
      label: 'Draft',
      count: stats.draft,
      icon: FileEdit,
      colorClass: 'text-slate-700',
      activeBorder: 'border-slate-400 bg-slate-100 text-slate-900',
      isSiren: stats.alertDraft || stats.draft > 0,
    },
    {
      id: 'Dikirim ke MD',
      label: 'Kirim ke MD',
      count: stats.kirimMD,
      icon: Send,
      colorClass: 'text-sky-600',
      activeBorder: 'border-sky-400 bg-sky-50 text-sky-900',
      isSiren: false,
    },
    {
      id: 'Proses di MD',
      label: 'Proses di MD',
      count: stats.prosesMD,
      icon: Wrench,
      colorClass: 'text-amber-600',
      activeBorder: 'border-amber-400 bg-amber-50 text-amber-900',
      isSiren: false,
    },
    {
      id: 'Dikirim ke Dealer',
      label: 'Kirim ke Dealer',
      count: stats.kirimDealer,
      icon: Truck,
      colorClass: 'text-indigo-600',
      activeBorder: 'border-indigo-400 bg-indigo-50 text-indigo-900',
      isSiren: false,
    },
    {
      id: 'Selesai',
      label: 'Selesai',
      count: stats.selesai,
      icon: CheckCircle2,
      colorClass: 'text-emerald-600',
      activeBorder: 'border-emerald-400 bg-emerald-50 text-emerald-900',
      isSiren: false,
    },
  ];

  return (
    <div className="px-3.5 pt-2 pb-1 select-none">
      {/* Header Bar: Label Status & Tombol Reset Semua */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[10.5px] font-bold text-slate-800 tracking-wider uppercase">
            Status Klaim
          </h3>
          <motion.span
            key={totalCount}
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="text-[9.5px] font-mono font-bold text-slate-500"
          >
            ({totalCount})
          </motion.span>
        </div>
        <AnimatePresence>
          {activeFilter !== 'ALL' && (
            <motion.button
              type="button"
              initial={{ opacity: 0, x: 8, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 8, scale: 0.9 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => onFilterChange('ALL')}
              className="text-[10.5px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Tampilkan Semua</span>
              <span className="text-[8.5px] bg-red-100 text-red-700 px-1 py-0.5 rounded leading-none">✕</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Grid 5 Kartu Status (Semua Terlihat di Layar dalam 2 Baris Ringkas) */}
      <div className="grid grid-cols-6 gap-1.5">
        {/* Baris 1: 3 Kartu Teratas (Draft, Kirim MD, Proses MD) */}
        {cards.slice(0, 3).map((item) => {
          const isActive = activeFilter === item.id;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(isActive ? 'ALL' : item.id)}
              whileHover={{ scale: 1.025, y: -1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 26 }}
              className={`col-span-2 relative flex flex-col items-center justify-center py-2 px-1 rounded-xl border cursor-pointer transition-colors duration-200 overflow-hidden ${
                isActive
                  ? `${item.activeBorder} shadow-sm font-bold`
                  : 'border-slate-200 bg-white hover:bg-slate-50 shadow-xs'
              } ${item.isSiren && item.id === 'Draft' ? 'animate-pulse ring-2 ring-red-400 bg-red-50 text-red-700' : ''}`}
            >
              {/* Fluid Active Sliding Highlight */}
              {isActive && (
                <motion.div
                  layoutId="pipelineActiveHighlight"
                  className="absolute inset-0 rounded-xl ring-2 ring-red-500/80 shadow-xs pointer-events-none z-10"
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                />
              )}

              {/* Glowing gradient wash for active state */}
              {isActive && (
                <motion.div
                  layoutId="pipelineActiveGlow"
                  className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/15 via-transparent to-transparent pointer-events-none z-0"
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                />
              )}

              {/* Indikator Merah Berkedip pada Draft (Ditempatkan di dalam sudut kanan atas kartu secara utuh tanpa terpotong bentuk) */}
              {item.isSiren && item.id === 'Draft' && (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5 z-20 pointer-events-none">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-80" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-1.5 ring-white shadow-xs" />
                </span>
              )}

              <motion.span
                key={`${item.id}-${item.count}-${isActive}`}
                initial={{ scale: 0.85, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className={`text-sm font-black tracking-tight leading-none z-10 relative ${item.colorClass}`}
              >
                {item.count}
              </motion.span>

              <div className="flex items-center gap-1 mt-1 text-slate-700 z-10 relative">
                <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="text-[10px] font-semibold leading-none truncate">
                  {item.label}
                </span>
              </div>
            </motion.button>
          );
        })}

        {/* Baris 2: 2 Kartu Bawah (Kirim ke Dealer, Selesai) */}
        {cards.slice(3, 5).map((item) => {
          const isActive = activeFilter === item.id;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(isActive ? 'ALL' : item.id)}
              whileHover={{ scale: 1.025, y: -1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 26 }}
              className={`col-span-3 relative flex items-center justify-center gap-2 py-2 px-2 rounded-xl border cursor-pointer transition-colors duration-200 overflow-hidden ${
                isActive
                  ? `${item.activeBorder} shadow-sm font-bold`
                  : 'border-slate-200 bg-white hover:bg-slate-50 shadow-xs'
              }`}
            >
              {/* Fluid Active Sliding Highlight */}
              {isActive && (
                <motion.div
                  layoutId="pipelineActiveHighlight"
                  className="absolute inset-0 rounded-xl ring-2 ring-red-500/80 shadow-xs pointer-events-none z-10"
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                />
              )}

              <motion.span
                key={`${item.id}-${item.count}-${isActive}`}
                initial={{ scale: 0.85, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className={`text-sm font-black tracking-tight leading-none z-10 relative ${item.colorClass}`}
              >
                {item.count}
              </motion.span>

              <div className="flex items-center gap-1 text-slate-700 z-10 relative">
                <Icon className="w-3 h-3 flex-shrink-0" />
                <span className="text-[10.5px] font-semibold leading-none truncate">
                  {item.label}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
