import React from 'react';
import { DashboardStats } from '../types';
import { FileEdit, Send, Wrench, Truck, CheckCircle2 } from 'lucide-react';

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
      colorClass: 'text-slate-200',
      activeBorder: 'border-slate-400 bg-slate-800/90 text-white',
      isSiren: stats.alertDraft || stats.draft > 0,
    },
    {
      id: 'Dikirim ke MD',
      label: 'Kirim ke MD',
      count: stats.kirimMD,
      icon: Send,
      colorClass: 'text-sky-300',
      activeBorder: 'border-sky-500 bg-sky-950/90 text-sky-200',
      isSiren: false,
    },
    {
      id: 'Proses di MD',
      label: 'Proses di MD',
      count: stats.prosesMD,
      icon: Wrench,
      colorClass: 'text-amber-300',
      activeBorder: 'border-amber-500 bg-amber-950/90 text-amber-200',
      isSiren: false,
    },
    {
      id: 'Dikirim ke Dealer',
      label: 'Kirim ke Dealer',
      count: stats.kirimDealer,
      icon: Truck,
      colorClass: 'text-indigo-200',
      activeBorder: 'border-indigo-500 bg-indigo-950/90 text-indigo-200',
      isSiren: false,
    },
    {
      id: 'Selesai',
      label: 'Selesai',
      count: stats.selesai,
      icon: CheckCircle2,
      colorClass: 'text-emerald-300',
      activeBorder: 'border-emerald-500 bg-emerald-950/90 text-emerald-200',
      isSiren: false,
    },
  ];

  return (
    <div className="px-3.5 pt-2 pb-1">
      {/* Header Bar: Label Status & Tombol Reset Semua */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[10.5px] font-bold text-white/85 tracking-wider uppercase">
            Status Alur Klaim
          </h3>
          <span className="text-[9.5px] font-mono text-white/50">({totalCount})</span>
        </div>
        {activeFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => onFilterChange('ALL')}
            className="text-[10.5px] font-semibold text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
          >
            Tampilkan Semua
          </button>
        )}
      </div>

      {/* Grid 5 Kartu Status (Semua Terlihat di Layar dalam 2 Baris Ringkas) */}
      <div className="grid grid-cols-6 gap-1.5">
        {/* Baris 1: 3 Kartu Teratas (Draft, Kirim MD, Proses MD) */}
        {cards.slice(0, 3).map((item) => {
          const isActive = activeFilter === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(isActive ? 'ALL' : item.id)}
              className={`col-span-2 relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 border backdrop-blur-md active:scale-95 cursor-pointer ${
                isActive
                  ? `${item.activeBorder} shadow-sm ring-1.5 ring-red-500/70 scale-[1.01]`
                  : 'border-white/10 bg-white/10 hover:bg-white/15'
              } ${item.isSiren && item.id === 'Draft' ? 'animate-pulse ring-1.5 ring-red-500 bg-red-950/40' : ''}`}
            >
              {item.isSiren && item.id === 'Draft' && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}

              <span className={`text-sm font-black tracking-tight leading-none ${item.colorClass}`}>
                {item.count}
              </span>
              <div className="flex items-center gap-1 mt-1 text-white/80">
                <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="text-[10px] font-semibold leading-none truncate">
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}

        {/* Baris 2: 2 Kartu Bawah (Kirim ke Dealer, Selesai) */}
        {cards.slice(3, 5).map((item) => {
          const isActive = activeFilter === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(isActive ? 'ALL' : item.id)}
              className={`col-span-3 relative flex items-center justify-center gap-2 py-1.5 px-2 rounded-xl transition-all duration-150 border backdrop-blur-md active:scale-95 cursor-pointer ${
                isActive
                  ? `${item.activeBorder} shadow-sm ring-1.5 ring-red-500/70 scale-[1.01]`
                  : 'border-white/10 bg-white/10 hover:bg-white/15'
              }`}
            >
              <span className={`text-sm font-black tracking-tight leading-none ${item.colorClass}`}>
                {item.count}
              </span>
              <div className="flex items-center gap-1 text-white/80">
                <Icon className="w-3 h-3 flex-shrink-0" />
                <span className="text-[10.5px] font-semibold leading-none truncate">
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
