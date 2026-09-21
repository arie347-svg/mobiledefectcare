const DAFTAR_LIBUR_NASIONAL_2026 = [
  '2026-01-01', '2026-01-16', '2026-02-17', '2026-03-03', '2026-03-20', '2026-03-21',
  '2026-04-03', '2026-05-01', '2026-05-14', '2026-05-27', '2026-06-01', '2026-06-16',
  '2026-07-07', '2026-08-17', '2026-08-25', '2026-10-14', '2026-12-25'
];

export function parseTanggalAman(val: string | number | Date | null | undefined): Date {
  if (!val || val === '-') return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);

  let str = val.toString().trim();
  const matchIndo = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchIndo) {
    const day = parseInt(matchIndo[1], 10);
    const month = parseInt(matchIndo[2], 10) - 1;
    const year = parseInt(matchIndo[3], 10);
    return new Date(year, month, day);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function isHariLiburAtauMinggu(d: Date): boolean {
  if (!d || isNaN(d.getTime())) return false;
  if (d.getDay() === 0) return true; // Minggu libur
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dt = String(d.getDate()).padStart(2, '0');
  return DAFTAR_LIBUR_NASIONAL_2026.includes(`${y}-${m}-${dt}`);
}

export const TARGET_LEADTIME_HARI_KERJA = 8;

export function formatTanggalIndonesia(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${day}-${mNames[d.getMonth()]}-${d.getFullYear()}`;
}

export function hitungEstimasiSelesai(
  startDateInput: string | Date,
  mdTargetSelesai?: string | null,
  targetHariKerja: number = TARGET_LEADTIME_HARI_KERJA
): string {
  try {
    // 1. PRIORITAS UTAMA: Jika MD Target Selesai sudah diisi di spreadsheet (Claim Header)
    if (mdTargetSelesai && typeof mdTargetSelesai === 'string' && mdTargetSelesai.trim() !== '' && mdTargetSelesai.trim() !== '-') {
      const parsedMdTarget = parseTanggalAman(mdTargetSelesai);
      if (!isNaN(parsedMdTarget.getTime())) {
        return formatTanggalIndonesia(parsedMdTarget);
      }
      return mdTargetSelesai.trim();
    }

    // 2. PRIORITAS KEDUA: Hitung otomatis berdasarkan N hari kerja efektif (melewati Minggu & hari libur)
    const cur = parseTanggalAman(startDateInput);
    let daysAdded = 0;
    while (daysAdded < targetHariKerja) {
      cur.setDate(cur.getDate() + 1);
      if (!isHariLiburAtauMinggu(cur)) {
        daysAdded++;
      }
    }
    return formatTanggalIndonesia(cur);
  } catch (_) {
    return '-';
  }
}

export function hitungAktualHariKerja(startDateInput: string | Date, endDateInput?: string | Date | null): number {
  try {
    const cur = parseTanggalAman(startDateInput);
    const end = endDateInput ? parseTanggalAman(endDateInput) : new Date();
    let count = 0;
    const temp = new Date(cur.getTime());
    while (temp < end) {
      temp.setDate(temp.getDate() + 1);
      if (!isHariLiburAtauMinggu(temp)) count++;
    }
    return Math.max(1, count);
  } catch (_) {
    return TARGET_LEADTIME_HARI_KERJA;
  }
}

export function hitungSisaJamKerja(startDateInput: string | Date, baseHours: number): number {
  try {
    const start = parseTanggalAman(startDateInput);
    const now = new Date();
    let extraHours = 0;
    const checkDate = new Date(start.getTime());
    const maxDays = Math.ceil(baseHours / 24) + 10;
    let workingDays = 0;
    let totalDays = 0;

    while (workingDays < Math.ceil(baseHours / 24) && totalDays < maxDays) {
      checkDate.setDate(checkDate.getDate() + 1);
      totalDays++;
      if (isHariLiburAtauMinggu(checkDate)) {
        extraHours += 24;
      } else {
        workingDays++;
      }
    }

    const totalAllowed = baseHours + extraHours;
    const elapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, Math.ceil(totalAllowed - elapsed));
  } catch (_) {
    return baseHours;
  }
}

export function formatTimestampWIB(val: string | number | Date | null | undefined): string {
  if (!val) return '-';
  const d = parseTanggalAman(val);
  if (isNaN(d.getTime())) return val.toString();

  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const mmm = months[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  return `${dd}-${mmm}-${yy} ${hh}:${mm} WIB`;
}

export function compressImage(file: File, maxDim = 800, quality = 0.60): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;

        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target?.result as string);
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Gagal memuat file gambar'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(file);
  });
}
