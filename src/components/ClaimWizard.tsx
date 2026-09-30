import React, { useState, useEffect, useMemo } from 'react';
import {
  UserProfile,
  MasterDataResponse,
  SimpanKlaimPayload,
  PayloadMotorItem,
  ClaimItem,
} from '../types';
import {
  ArrowLeft,
  Calendar,
  Truck,
  Plus,
  Trash2,
  Camera,
  Barcode,
  Save,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Car,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { compressClaimImage } from '../utils/imageCompressor';
import {
  generateLocalDraftId,
  generateOfficialClaimId,
  isLocalDraftIdentifier,
  saveLocalDraft,
  updateLocalDraft,
  getLocalDrafts,
  clearSubmittedDraft,
  isDraftAlreadySubmitted,
  recordMutationLock,
  saveActiveWizardSession,
  normalizeSj,
} from '../utils/draftStorage';

// Manual transporter options when nopol is not in master spreadsheet list
const MANUAL_TRANSPORTERS = ['TM', 'RJTM', 'JTM', 'WSS', 'YSS', 'SBR'];


interface ClaimWizardProps {
  user: UserProfile;
  masterData: MasterDataResponse;
  initialDraft?: ClaimItem | null;
  onCancel: () => void;
  onSubmitSuccess: (idKlaim: string, status: string, claimItem?: ClaimItem) => void;
}

export const determineDraftResumeStep = (draft?: ClaimItem | null): number => {
  if (!draft) return 1;

  // 1. Evaluasi bertahap:
  // Step 1: No SJ, foto sopir PJ, data sopir, nopol, transporter, paraf sopir
  const isStep1Complete = Boolean(
    draft.noSj &&
      draft.noSj.replace(/\D/g, '').length === 11 &&
      draft.fotoSopirPJ?.trim() &&
      draft.sopirPJ?.trim() &&
      draft.nopolPJ?.trim() &&
      draft.transporterPJ?.trim() &&
      draft.parafSopirPJ
  );
  if (!isStep1Complete) return 1;

  if (draft.lastStep && draft.lastStep >= 1 && draft.lastStep <= 3) {
    return draft.lastStep;
  }

  // Step 2: Harus ada minimal 1 item, dan seluruh item terisi lengkap (namaPart, kerusakan, penyebab, fotoPart)
  const hasItems = Array.isArray(draft.items) && draft.items.length > 0;
  const isStep2Complete =
    hasItems &&
    draft.items.every(
      (it) =>
        it.tipe?.trim() &&
        it.noMesin?.trim() &&
        it.noRangka?.trim() &&
        it.namaPart?.trim() &&
        it.kerusakan?.trim() &&
        it.penyebab?.trim() &&
        it.fotoPart &&
        it.fotoPart.trim() !== ''
    );
  if (!isStep2Complete) return 2;

  // Step 3: Jika Step 1 dan 2 selesai, pengguna melanjutkan ke Step 3
  return 3;
};

export const ClaimWizard: React.FC<ClaimWizardProps> = ({
  user,
  masterData,
  initialDraft,
  onCancel,
  onSubmitSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(() => determineDraftResumeStep(initialDraft));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState<'Draft' | 'Dikirim ke MD' | null>(null);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Dynamic transporter list combining master data from Spreadsheet and user additions
  const [transporterList, setTransporterList] = useState<any[]>(() => {
    let customList: any[] = [];
    try {
      const saved = localStorage.getItem('mdc_custom_transporters');
      if (saved) customList = JSON.parse(saved);
    } catch (_) {}
    const baseList = masterData?.transporterList || [];
    const merged = [...baseList, ...customList];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = (item.nopol || '').toUpperCase().replace(/\s/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  // Reaktif terhadap pembaruan masterData dari Google Spreadsheet
  useEffect(() => {
    if (masterData?.transporterList && masterData.transporterList.length > 0) {
      setTransporterList((prev) => {
        let customList: any[] = [];
        try {
          const saved = localStorage.getItem('mdc_custom_transporters');
          if (saved) customList = JSON.parse(saved);
        } catch (_) {}
        const baseList = masterData.transporterList || [];
        const merged = [...baseList, ...customList, ...prev];
        const seen = new Set<string>();
        return merged.filter((item) => {
          const key = (item.nopol || '').toUpperCase().replace(/\s/g, '');
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
    }
  }, [masterData?.transporterList]);

  const [showNopolDropdown, setShowNopolDropdown] = useState(false);
  const [showNopolKembaliDropdown, setShowNopolKembaliDropdown] = useState(false);

  // STEP 1 STATE: Dokumen & PJ Bongkar
  const [noSj, setNoSj] = useState<string>(
    initialDraft?.noSj ? initialDraft.noSj.replace(/\D/g, '').slice(0, 11) : ''
  );
  const [tglDo, setTglDo] = useState<string>(initialDraft?.tglDo || new Date().toISOString().split('T')[0]);
  const [tglPemeriksaan, setTglPemeriksaan] = useState<string>(
    initialDraft?.tglPeriksa || new Date().toISOString().split('T')[0]
  );
  const [fotoSopirPJ, setFotoSopirPJ] = useState<string>(initialDraft?.fotoSopirPJ || ''); // << STATE FOTO SOPIR
  const [namaSopirPJ, setNamaSopirPJ] = useState<string>(initialDraft?.sopirPJ || '');
  const [nopolPJ, setNopolPJ] = useState<string>(initialDraft?.nopolPJ || '');
  const [transporterPJ, setTransporterPJ] = useState<string>(initialDraft?.transporterPJ || '');
  const [parafSopir, setParafSopir] = useState<string>(initialDraft?.parafSopirPJ || '');

  // Handler kamera langsung dengan kompresi otomatis (khusus jepretan kamera HP)
  const handleFotoSopirCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Kompresi adaptif optimal ke max 800px & kualitas 0.65 (target <80KB)
      const base64 = await compressClaimImage(file, {
        maxDimension: 800,
        initialQuality: 0.65,
        maxSizeBytes: 80 * 1024,
      });
      setFotoSopirPJ(base64);
    } catch (_) {
      alert('Gagal memproses foto sopir. Silakan coba ambil ulang.');
    }
  };

  // STEP 2 STATE: Multi-motor & Multi-part
  const buildInitialMotors = (): PayloadMotorItem[] => {
    if (initialDraft && initialDraft.items && initialDraft.items.length > 0) {
      const motorMap = new Map<number, PayloadMotorItem>();
      initialDraft.items.forEach((item) => {
        const idx = item.indexMotor || 1;
        if (!motorMap.has(idx)) {
          motorMap.set(idx, {
            tipeMotor: item.tipe || '',
            warna: item.warna || '',
            noMesin: item.noMesin || '',
            noRangka: item.noRangka || '',
            parts: [],
          });
        }
        motorMap.get(idx)!.parts.push({
          namaPart: item.namaPart || '',
          jenisKerusakan: item.kerusakan || '',
          penyebab: item.penyebab || '',
          fotoPart: item.fotoPart || '',
        });
      });
      return Array.from(motorMap.values());
    }

    return [
      {
        tipeMotor: '',
        warna: '',
        noMesin: '',
        noRangka: '',
        parts: [
          {
            namaPart: '',
            jenisKerusakan: '',
            penyebab: '',
            fotoPart: '',
          },
        ],
      },
    ];
  };

  const [motors, setMotors] = useState<PayloadMotorItem[]>(buildInitialMotors);
  const [activeMotorIndex, setActiveMotorIndex] = useState<number>(0);
  const [activePartIndex, setActivePartIndex] = useState<Record<number, number>>({ 0: 0 });

  // State untuk melacak dropdown mana yang sedang aktif
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Dynamic Custom Items State
  const [customTipes, setCustomTipes] = useState<string[]>([]);
  const [customWarnas, setCustomWarnas] = useState<{ tipe: string; warna: string }[]>([]);
  const [customParts, setCustomParts] = useState<{ tipe: string; namaPart: string }[]>([]);
  const [customKerusakans, setCustomKerusakans] = useState<string[]>([]);
  const [customPenyebabs, setCustomPenyebabs] = useState<string[]>([]);

  // GLOBAL CLICK-OUTSIDE LISTENER
  useEffect(() => {
    const handleGlobalPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-dropdown]')) {
        setActiveDropdown(null);
        setShowNopolDropdown(false);
        setShowNopolKembaliDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleGlobalPointerDown);
    document.addEventListener('touchstart', handleGlobalPointerDown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalPointerDown);
      document.removeEventListener('touchstart', handleGlobalPointerDown);
    };
  }, []);

  const handleLockMotor = (mIdx: number) => {
    setErrorMessage(null);
    const motor = motors[mIdx];
    if (!motor.tipeMotor || !motor.tipeMotor.trim()) {
      setErrorMessage(`Unit Motor #${mIdx + 1}: Tipe Motor wajib dipilih sebelum dikunci!`);
      return;
    }
    if (!motor.warna || !motor.warna.trim()) {
      setErrorMessage(`Unit Motor #${mIdx + 1}: Warna Motor wajib dipilih sebelum dikunci!`);
      return;
    }
    if (!motor.noMesin || !motor.noMesin.trim()) {
      setErrorMessage(`Unit Motor #${mIdx + 1}: Nomor Mesin wajib diisi sebelum dikunci!`);
      return;
    }
    if (!motor.noRangka || !motor.noRangka.trim()) {
      setErrorMessage(`Unit Motor #${mIdx + 1}: Nomor Rangka wajib diisi sebelum dikunci!`);
      return;
    }

    for (let p = 0; p < motor.parts.length; p++) {
      const part = motor.parts[p];
      if (!part.namaPart || !part.namaPart.trim()) {
        setErrorMessage(`Unit Motor #${mIdx + 1}, Part #${p + 1}: Nama Part belum dipilih!`);
        setActivePartIndex((prev) => ({ ...prev, [mIdx]: p }));
        return;
      }
      if (!part.jenisKerusakan || !part.jenisKerusakan.trim()) {
        setErrorMessage(`Unit Motor #${mIdx + 1}, Part #${p + 1}: Jenis Kerusakan belum dipilih!`);
        setActivePartIndex((prev) => ({ ...prev, [mIdx]: p }));
        return;
      }
      if (!part.penyebab || !part.penyebab.trim()) {
        setErrorMessage(`Unit Motor #${mIdx + 1}, Part #${p + 1}: Penyebab Cacat belum dipilih!`);
        setActivePartIndex((prev) => ({ ...prev, [mIdx]: p }));
        return;
      }
      if (!part.fotoPart || !part.fotoPart.trim()) {
        setErrorMessage(`Unit Motor #${mIdx + 1}, Part #${p + 1} (${part.namaPart || 'Part'}): Foto Cacat Part wajib diambil/diunggah sebelum dikunci!`);
        setActivePartIndex((prev) => ({ ...prev, [mIdx]: p }));
        return;
      }
    }

    setActiveMotorIndex(-1);
    setActivePartIndex((prev) => ({ ...prev, [mIdx]: -1 }));
    setActiveDropdown(null);
  };

  const handleLockPart = (mIdx: number, pIdx: number) => {
    setErrorMessage(null);
    const part = motors[mIdx].parts[pIdx];
    if (!part.namaPart || !part.namaPart.trim()) {
      setErrorMessage(`Motor #${mIdx + 1}, Part #${pIdx + 1}: Nama Part wajib dipilih sebelum dikunci!`);
      return;
    }
    if (!part.jenisKerusakan || !part.jenisKerusakan.trim()) {
      setErrorMessage(`Motor #${mIdx + 1}, Part #${pIdx + 1}: Jenis Kerusakan wajib dipilih sebelum dikunci!`);
      return;
    }
    if (!part.penyebab || !part.penyebab.trim()) {
      setErrorMessage(`Motor #${mIdx + 1}, Part #${pIdx + 1}: Penyebab Cacat wajib dipilih sebelum dikunci!`);
      return;
    }
    if (!part.fotoPart || !part.fotoPart.trim()) {
      setErrorMessage(`Motor #${mIdx + 1}, Part #${pIdx + 1} (${part.namaPart || 'Part'}): Foto Cacat Part wajib diambil/diunggah sebelum dikunci!`);
      return;
    }

    setActivePartIndex((prev) => ({
      ...prev,
      [mIdx]: -1,
    }));
    setActiveDropdown(null);
  };

  const handleAddPartWithValidation = (mIdx: number) => {
    setErrorMessage(null);
    const currentPIdx = activePartIndex[mIdx] ?? (motors[mIdx].parts.length - 1);
    if (currentPIdx >= 0 && currentPIdx < motors[mIdx].parts.length) {
      const currentPart = motors[mIdx].parts[currentPIdx];
      if (!currentPart.namaPart || !currentPart.namaPart.trim()) {
        setErrorMessage(`Motor #${mIdx + 1}, Part #${currentPIdx + 1}: Lengkapi Nama Part terlebih dahulu!`);
        return;
      }
      if (!currentPart.jenisKerusakan || !currentPart.jenisKerusakan.trim()) {
        setErrorMessage(`Motor #${mIdx + 1}, Part #${currentPIdx + 1}: Lengkapi Jenis Kerusakan terlebih dahulu!`);
        return;
      }
      if (!currentPart.penyebab || !currentPart.penyebab.trim()) {
        setErrorMessage(`Motor #${mIdx + 1}, Part #${currentPIdx + 1}: Lengkapi Penyebab Cacat terlebih dahulu!`);
        return;
      }
      if (!currentPart.fotoPart || !currentPart.fotoPart.trim()) {
        setErrorMessage(`Motor #${mIdx + 1}, Part #${currentPIdx + 1}: Foto Cacat Part wajib diambil/diunggah sebelum menambah part baru!`);
        return;
      }
    }
    addPart(mIdx);
    setActiveDropdown(null);
  };

  // STEP 3 STATE
  // Mode kunci metode HANYA aktif jika draft sebelumnya memang sudah memiliki metode pengembalian valid ('DIKIRIM LANGSUNG' atau 'DITITIP')
  // Jika sebelumnya pengguna menekan tombol draft sebelum memilih metode, kedua tombol metode tetap terbuka dan bisa diedit
  const isMethodLocked = Boolean(
    initialDraft &&
      initialDraft.metodeKembali &&
      (initialDraft.metodeKembali.trim() === 'DIKIRIM LANGSUNG' || initialDraft.metodeKembali.trim() === 'DITITIP')
  );

  const [metodeKembali, setMetodeKembali] = useState<string>(() => {
    const raw = (initialDraft?.metodeKembali || '').trim();
    return raw === 'DIKIRIM LANGSUNG' || raw === 'DITITIP' ? raw : '';
  });
  const [namaSopirKembali, setNamaSopirKembali] = useState<string>(initialDraft?.sopirKembali || '');
  const [nopolKembali, setNopolKembali] = useState<string>(initialDraft?.nopolKembali || '');
  const [transporterKembali, setTransporterKembali] = useState<string>(initialDraft?.transporterKembali || '');
  const [parafUser, setParafUser] = useState<string>(initialDraft?.parafUser || '');

  // Barcode Scanner Modal State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<{
    motorIndex: number;
    field: 'noMesin' | 'noRangka';
  } | null>(null);

  const handleNoSjChange = (val: string) => {
    const numericOnly = val.replace(/\D/g, '').slice(0, 11);
    setNoSj(numericOnly);
  };

  const matchedTransporterPJ = transporterList.find(
    (t) =>
      nopolPJ.trim().length > 0 &&
      t.nopol.toUpperCase().replace(/\s/g, '') === nopolPJ.toUpperCase().replace(/\s/g, '')
  );
  const isManualNopolPJ = nopolPJ.trim().length > 0 && !matchedTransporterPJ;

  const filteredNopolList = useMemo(() => {
    if (!nopolPJ.trim()) return transporterList;
    const cleanSearch = nopolPJ.toUpperCase().replace(/\s/g, '');
    return transporterList.filter((item) => {
      const cleanItem = item.nopol.toUpperCase().replace(/\s/g, '');
      return cleanItem.includes(cleanSearch);
    });
  }, [transporterList, nopolPJ]);

  const handleNopolPJInput = (val: string) => {
    const clean = val.toUpperCase();
    setNopolPJ(clean);
    const norm = clean.replace(/\s/g, '');
    const matched = transporterList.find(
      (t) => t.nopol.toUpperCase().replace(/\s/g, '') === norm
    );
    if (matched) {
      setTransporterPJ(matched.transporter);
    } else {
      if (!MANUAL_TRANSPORTERS.includes(transporterPJ)) {
        setTransporterPJ('');
      }
    }
  };

  const handleSelectNopolPJ = (item: any) => {
    setNopolPJ(item.nopol.toUpperCase());
    setTransporterPJ(item.transporter);
    setShowNopolDropdown(false);
  };

  const handleManualTransporterChange = (val: string) => {
    setTransporterPJ(val);
    const cleanNopol = nopolPJ.trim().toUpperCase();
    if (cleanNopol && val) {
      const newItem = { nopol: cleanNopol, transporter: val };
      setTransporterList((prev) => {
        const withoutCurrent = prev.filter(
          (t) => t.nopol.toUpperCase().replace(/\s/g, '') !== cleanNopol.replace(/\s/g, '')
        );
        const updated = [newItem, ...withoutCurrent];
        try {
          const customSaved = localStorage.getItem('mdc_custom_transporters');
          const list = customSaved ? JSON.parse(customSaved) : [];
          const dedup = [newItem, ...list.filter((x: any) => x.nopol !== cleanNopol)];
          localStorage.setItem('mdc_custom_transporters', JSON.stringify(dedup));
        } catch (_) {}
        return updated;
      });
    }
  };

  const matchedTransporterKembali = transporterList.find(
    (t) =>
      nopolKembali.trim().length > 0 &&
      t.nopol.toUpperCase().replace(/\s/g, '') === nopolKembali.toUpperCase().replace(/\s/g, '')
  );
  const isManualNopolKembali = nopolKembali.trim().length > 0 && !matchedTransporterKembali;

  const filteredNopolKembaliList = useMemo(() => {
    if (!nopolKembali.trim()) return transporterList;
    const cleanSearch = nopolKembali.toUpperCase().replace(/\s/g, '');
    return transporterList.filter((item) => {
      const cleanItem = item.nopol.toUpperCase().replace(/\s/g, '');
      return cleanItem.includes(cleanSearch);
    });
  }, [transporterList, nopolKembali]);

  const handleNopolKembaliInput = (val: string) => {
    const clean = val.toUpperCase();
    setNopolKembali(clean);
    const norm = clean.replace(/\s/g, '');
    const matched = transporterList.find(
      (t) => t.nopol.toUpperCase().replace(/\s/g, '') === norm
    );
    if (matched) {
      setTransporterKembali(matched.transporter);
    } else {
      if (!MANUAL_TRANSPORTERS.includes(transporterKembali)) {
        setTransporterKembali('');
      }
    }
  };

  const handleSelectNopolKembali = (item: any) => {
    setNopolKembali(item.nopol.toUpperCase());
    setTransporterKembali(item.transporter);
    setShowNopolKembaliDropdown(false);
  };

  const handleManualTransporterKembaliChange = (val: string) => {
    setTransporterKembali(val);
    const cleanNopol = nopolKembali.trim().toUpperCase();
    if (cleanNopol && val) {
      const newItem = { nopol: cleanNopol, transporter: val };
      setTransporterList((prev) => {
        const withoutCurrent = prev.filter(
          (t) => t.nopol.toUpperCase().replace(/\s/g, '') !== cleanNopol.replace(/\s/g, '')
        );
        const updated = [newItem, ...withoutCurrent];
        try {
          const customSaved = localStorage.getItem('mdc_custom_transporters');
          const list = customSaved ? JSON.parse(customSaved) : [];
          const dedup = [newItem, ...list.filter((x: any) => x.nopol !== cleanNopol)];
          localStorage.setItem('mdc_custom_transporters', JSON.stringify(dedup));
        } catch (_) {}
        return updated;
      });
    }
  };

  const addMotor = () => {
    const newMotorIndex = motors.length;
    setMotors([
      ...motors,
      {
        tipeMotor: '',
        warna: '',
        noMesin: '',
        noRangka: '',
        parts: [
          {
            namaPart: '',
            jenisKerusakan: '',
            penyebab: '',
            fotoPart: '',
          },
        ],
      },
    ]);
    setActiveMotorIndex(newMotorIndex);
    setActivePartIndex((prev) => ({ ...prev, [newMotorIndex]: 0 }));
    setActiveDropdown(null);
  };

  const removeMotor = (index: number) => {
    if (motors.length <= 1) return;
    const updated = motors.filter((_, i) => i !== index);
    setMotors(updated);
    setActiveMotorIndex((prev) => (prev >= updated.length ? updated.length - 1 : prev));
    setActiveDropdown(null);
  };

  const updateMotor = (index: number, field: keyof PayloadMotorItem, val: any) => {
    const updated = [...motors];
    updated[index] = { ...updated[index], [field]: val };
    setMotors(updated);
  };

  const addPart = (motorIndex: number) => {
    const updated = [...motors];
    const newPartIndex = updated[motorIndex].parts.length;
    updated[motorIndex].parts.push({
      namaPart: '',
      jenisKerusakan: '',
      penyebab: '',
      fotoPart: '',
    });
    setMotors(updated);
    setActivePartIndex((prev) => ({
      ...prev,
      [motorIndex]: newPartIndex,
    }));
  };

  const removePart = (motorIndex: number, partIndex: number) => {
    const updated = [...motors];
    if (updated[motorIndex].parts.length <= 1) return;
    updated[motorIndex].parts = updated[motorIndex].parts.filter((_, i) => i !== partIndex);
    setMotors(updated);
    setActivePartIndex((prev) => {
      const current = prev[motorIndex] ?? 0;
      return {
        ...prev,
        [motorIndex]: current >= updated[motorIndex].parts.length ? updated[motorIndex].parts.length - 1 : current,
      };
    });
  };

  const updatePart = (
    motorIndex: number,
    partIndex: number,
    field: keyof PayloadMotorItem['parts'][0],
    val: string
  ) => {
    const updated = [...motors];
    updated[motorIndex].parts[partIndex] = {
      ...updated[motorIndex].parts[partIndex],
      [field]: val,
    };
    setMotors(updated);
  };

  const handleSelectMetodeKembali = (metode: 'DIKIRIM LANGSUNG' | 'DITITIP') => {
    if (isMethodLocked) return;

    setMetodeKembali(metode);
    if (metode === 'DIKIRIM LANGSUNG') {
      setNamaSopirKembali(namaSopirPJ);
      setNopolKembali(nopolPJ);
      setTransporterKembali(transporterPJ);
    } else if (metode === 'DITITIP') {
      setNamaSopirKembali('');
      setNopolKembali('');
      setTransporterKembali('');
    }
  };

  const handlePhotoUpload = async (
    motorIndex: number,
    partIndex: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Kompresi otomatis adaptif: 1000px, kualitas 0.65, max 95KB
      // Tetap tajam untuk detail nomor part, retakan, atau goresan motor
      const base64 = await compressClaimImage(file, {
        maxDimension: 1000,
        initialQuality: 0.65,
        maxSizeBytes: 95 * 1024,
      });
      updatePart(motorIndex, partIndex, 'fotoPart', base64);
    } catch (_) {
      alert('Gagal memproses foto. Silakan coba lagi.');
    }
  };

  const triggerScan = (motorIndex: number, field: 'noMesin' | 'noRangka') => {
    setScannerTarget({ motorIndex, field });
    setScannerOpen(true);
  };

  const handleBarcodeDetected = (code: string) => {
    if (scannerTarget) {
      updateMotor(scannerTarget.motorIndex, scannerTarget.field, code);
    }
    setScannerOpen(false);
  };

  const validateStep1 = () => {
    if (!noSj.trim()) return 'Nomor Surat Jalan wajib diisi!';
    if (noSj.length !== 11) return 'Nomor Surat Jalan harus berupa 11 digit angka!';
    if (!tglDo) return 'Tanggal DO wajib diisi!';
    if (!tglPemeriksaan) return 'Tanggal Periksa wajib diisi!';
    if (!fotoSopirPJ) return 'Foto bukti mengetahui sopir wajib diambil via kamera!'; // << VALIDASI FOTO SOPIR
    if (!namaSopirPJ.trim()) return 'Nama Sopir wajib diisi!';
    if (!nopolPJ.trim()) return 'Nomor Polisi wajib diisi!';
    if (!transporterPJ.trim()) return 'Transporter wajib dipilih!';
    if (!parafSopir) return 'Paraf Sopir wajib dibubuhkan!';
    return null;
  };

  const validateStep2 = () => {
    for (let m = 0; m < motors.length; m++) {
      const motor = motors[m];
      if (!motor.tipeMotor) return `Motor #${m + 1}: Tipe motor belum dipilih!`;
      if (!motor.warna) return `Motor #${m + 1}: Warna motor belum dipilih!`;
      if (!motor.noMesin.trim()) return `Motor #${m + 1}: Nomor mesin wajib diisi!`;
      if (!motor.noRangka.trim()) return `Motor #${m + 1}: Nomor rangka wajib diisi!`;

      for (let p = 0; p < motor.parts.length; p++) {
        const part = motor.parts[p];
        if (!part.namaPart) return `Motor #${m + 1}, Part #${p + 1}: Nama part belum dipilih!`;
        if (!part.jenisKerusakan) return `Motor #${m + 1}, Part #${p + 1}: Jenis kerusakan wajib dipilih!`;
        if (!part.penyebab) return `Motor #${m + 1}, Part #${p + 1}: Penyebab cacat wajib dipilih!`;
        if (!part.fotoPart || !part.fotoPart.trim()) {
          return `Foto Cacat Part wajib diambil/diunggah untuk setiap item! (Unit Motor #${m + 1}, Part #${p + 1}: ${part.namaPart || 'Part'})`;
        }
      }
    }
    return null;
  };

  const validateStep3 = (isDraft = false) => {
    if (!metodeKembali || !metodeKembali.trim()) {
      return 'Metode pengembalian part wajib dipilih!';
    }
    if (metodeKembali === 'DIKIRIM LANGSUNG') {
      const driver = namaSopirKembali.trim() || namaSopirPJ.trim();
      const nopol = nopolKembali.trim() || nopolPJ.trim();
      const trans = transporterKembali.trim() || transporterPJ.trim();
      if (!driver) return 'Nama Sopir awal wajib diisi di Step 1!';
      if (!nopol) return 'Nomor Polisi awal wajib diisi di Step 1!';
      if (!trans) return 'Transporter awal wajib diisi di Step 1!';
    } else if (metodeKembali === 'DITITIP') {
      if (!isDraft) {
        if (!namaSopirKembali.trim()) {
          return 'Nama Sopir Pengembalian wajib diisi sebelum mengirim klaim!';
        }
        if (!nopolKembali.trim()) {
          return 'Nomor Polisi Pengembalian wajib diisi sebelum mengirim klaim!';
        }
        if (!transporterKembali.trim()) {
          return 'Transporter Pengembalian wajib dipilih sebelum mengirim klaim!';
        }
      }
    }
    if (!isDraft && !parafUser) {
      return 'Paraf Petugas PDI Dealer wajib dibubuhkan!';
    }
    return null;
  };

  const handleNext = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      const err = validateStep1();
      if (err) {
        setErrorMessage(err);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const err = validateStep2();
      if (err) {
        setErrorMessage(err);
        return;
      }
      setCurrentStep(3);
    }
  };

  // Unique Local Draft Identifier (DRAFT-xxx) - digunakan khusus untuk penyimpanan draft di browser/perangkat
  const [localDraftId] = useState<string>(() => {
    if (initialDraft?.localDraftId && isLocalDraftIdentifier(initialDraft.localDraftId)) {
      return initialDraft.localDraftId;
    }
    if (initialDraft?.idKlaim && isLocalDraftIdentifier(initialDraft.idKlaim)) {
      return initialDraft.idKlaim;
    }
    return generateLocalDraftId();
  });

  // Proteksi anti-double submit pada sesi aktif
  const hasSubmittedRef = React.useRef<boolean>(false);
  const pendingOfficialIdRef = React.useRef<string | null>(
    initialDraft?.idKlaim && !isLocalDraftIdentifier(initialDraft.idKlaim)
      ? initialDraft.idKlaim
      : null
  );

  // Auto-save sesi aktif di browser agar jika user melakukan Refresh (F5) atau keluar halaman, data & localDraftId tetap terjaga
  useEffect(() => {
    if (hasSubmittedRef.current) return;

    const finalNamaSopirKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (namaSopirKembali || namaSopirPJ)
        : namaSopirKembali;
    const finalNopolKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (nopolKembali || nopolPJ)
        : nopolKembali;
    const finalTransporterKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (transporterKembali || transporterPJ)
        : transporterKembali;

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeFormatted = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const snapshotDraft: ClaimItem = {
      idKlaim: localDraftId,
      localDraftId,
      isLocalDraft: true,
      createdAt: initialDraft?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      rawTimestamp: Date.now(),
      rawDate: tglPemeriksaan || now.toISOString().split('T')[0],
      tgl: `${dateFormatted} ${timeFormatted} WIB`,
      tglSelesai: '',
      status: 'Draft',
      lastStep: currentStep,
      noSj,
      tglDo,
      tglPeriksa: tglPemeriksaan,
      kodeAhm: user.kodeAhm,
      kodeDealer: user.kodeDealer || initialDraft?.kodeDealer,
      namaDealer: user.namaDealer,
      sopirPJ: namaSopirPJ,
      nopolPJ,
      transporterPJ,
      parafSopirPJ: parafSopir,
      fotoSopirPJ,
      metodeKembali,
      sopirKembali: finalNamaSopirKembali,
      nopolKembali: finalNopolKembali,
      transporterKembali: finalTransporterKembali,
      parafUser,
      draftDeadline: initialDraft?.draftDeadline || new Date(Date.now() + 24 * 3600000).toISOString(),
      kontakPengurusPJ: '',
      kontakPengurusKembali: '',
      kontakRepairman: '',
      kontakKaGudang: '',
      noHpPdi: user.noHp,
      items: motors.flatMap((m, mIdx) =>
        m.parts.map((p) => ({
          indexMotor: mIdx + 1,
          tipe: m.tipeMotor,
          warna: m.warna,
          noMesin: m.noMesin,
          noRangka: m.noRangka,
          namaPart: p.namaPart,
          kerusakan: p.jenisKerusakan,
          penyebab: p.penyebab,
          fotoPart: p.fotoPart,
        }))
      ),
    };

    // Gunakan debounce 500ms agar pengetikan cepat di HP tidak mengalami jeda/lag akibat I/O storage
    const debounceTimer = setTimeout(() => {
      saveActiveWizardSession(user.kodeAhm, snapshotDraft);

      // Selalu sinkronkan perubahan secara otomatis ke penyimpanan lokal (localStorage & IndexedDB)
      if (user?.kodeAhm) {
        updateLocalDraft(user.kodeAhm, localDraftId, snapshotDraft);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [
    localDraftId,
    currentStep,
    noSj,
    tglDo,
    tglPemeriksaan,
    namaSopirPJ,
    nopolPJ,
    transporterPJ,
    parafSopir,
    fotoSopirPJ,
    motors,
    metodeKembali,
    namaSopirKembali,
    nopolKembali,
    transporterKembali,
    parafUser,
    user,
    initialDraft,
  ]);

  const handleSaveClaim = async (status: 'Draft' | 'Dikirim ke MD') => {
    setErrorMessage(null);

    // 1. Proteksi Anti-Double Submit jika mengklik "Kirim ke MD"
    if (status === 'Dikirim ke MD') {
      if (isSubmitting || hasSubmittedRef.current || isDraftAlreadySubmitted(localDraftId).submitted) {
        setErrorMessage('Draft klaim ini sudah dikirim ke MD dan tidak dapat dikirim ulang.');
        return;
      }

      // Validasi seluruh data wajib (Step 1, Step 2, Step 3) sebelum kirim ke MD
      const err1 = validateStep1();
      if (err1) {
        setErrorMessage(err1);
        setCurrentStep(1);
        return;
      }
      const err2 = validateStep2();
      if (err2) {
        setErrorMessage(err2);
        setCurrentStep(2);
        return;
      }
      const err3 = validateStep3(false);
      if (err3) {
        setErrorMessage(err3);
        setCurrentStep(3);
        return;
      }

      // Cek koneksi internet ketika menekan "Kirim ke MD"
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setErrorMessage('Tidak dapat mengirim ke MD. Silakan periksa koneksi internet.');
        return;
      }
    }

    const finalNamaSopirKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (namaSopirKembali || namaSopirPJ)
        : namaSopirKembali;
    const finalNopolKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (nopolKembali || nopolPJ)
        : nopolKembali;
    const finalTransporterKembali =
      metodeKembali === 'DIKIRIM LANGSUNG'
        ? (transporterKembali || transporterPJ)
        : transporterKembali;

    setIsSubmitting(true);
    setSubmittingStatus(status);
    setSubmitProgress(18);

    // Jalankan animasi progres aktif sejak tahap kompresi foto agar tidak membeku di 0%
    const preCompressTimer = setInterval(() => {
      setSubmitProgress((prev) => (prev < 48 ? prev + 4 : prev));
    }, 45);

    try {
      // PRE-FLIGHT COMPRESSION SANITIZER (Safety Net):
      // Memastikan seluruh foto (sopir dan parts) lolos batas kompresi optimal
      let sanitizedFotoSopir = fotoSopirPJ;
      if (sanitizedFotoSopir && sanitizedFotoSopir.length * 0.75 > 120 * 1024) {
        try {
          sanitizedFotoSopir = await compressClaimImage(sanitizedFotoSopir, {
            maxDimension: 800,
            initialQuality: 0.60,
            maxSizeBytes: 80 * 1024,
          });
        } catch (_) {}
      }

      const sanitizedMotors: PayloadMotorItem[] = await Promise.all(
        motors.map(async (m) => {
          const sanitizedParts = await Promise.all(
            m.parts.map(async (p) => {
              if (p.fotoPart && p.fotoPart.length * 0.75 > 150 * 1024) {
                try {
                  const compressed = await compressClaimImage(p.fotoPart, {
                    maxDimension: 1000,
                    initialQuality: 0.60,
                    maxSizeBytes: 95 * 1024,
                  });
                  return { ...p, fotoPart: compressed };
                } catch (_) {
                  return p;
                }
              }
              return p;
            })
          );
          return { ...m, parts: sanitizedParts };
        })
      );

      clearInterval(preCompressTimer);

      const now = new Date();
      const dateFormatted = now.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeFormatted = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // ============================================================================
      // JIKA STATUS DRAFT: 100% LOCAL SAJA (TIDAK ADA REQUEST KE SPREADSHEET/BACKEND)
      // - Gunakan localDraftId (DRAFT-xxx)
      // - JANGAN generate Id Klaim resmi (CLM-xxx)
      // - Jika mengedit draft existing, UPDATE record localDraftId yang sama
      // ============================================================================
      if (status === 'Draft') {
        const localDraftClaimItem: ClaimItem = {
          idKlaim: localDraftId,
          localDraftId,
          isLocalDraft: true,
          createdAt: initialDraft?.createdAt || now.toISOString(),
          updatedAt: now.toISOString(),
          rawTimestamp: Date.now(),
          rawDate: tglPemeriksaan || now.toISOString().split('T')[0],
          tgl: `${dateFormatted} ${timeFormatted} WIB`,
          tglSelesai: '',
          status: 'Draft',
          lastStep: currentStep,
          noSj,
          tglDo,
          tglPeriksa: tglPemeriksaan,
          kodeAhm: user.kodeAhm,
          kodeDealer: user.kodeDealer || initialDraft?.kodeDealer,
          namaDealer: user.namaDealer,
          sopirPJ: namaSopirPJ,
          nopolPJ,
          transporterPJ,
          parafSopirPJ: parafSopir,
          fotoSopirPJ: sanitizedFotoSopir,
          metodeKembali,
          sopirKembali: finalNamaSopirKembali,
          nopolKembali: finalNopolKembali,
          transporterKembali: finalTransporterKembali,
          parafUser,
          draftDeadline: initialDraft?.draftDeadline || new Date(Date.now() + 24 * 3600000).toISOString(),
          kontakPengurusPJ: '',
          kontakPengurusKembali: '',
          kontakRepairman: '',
          kontakKaGudang: '',
          noHpPdi: user.noHp,
          items: sanitizedMotors.flatMap((m, mIdx) =>
            m.parts.map((p) => ({
              indexMotor: mIdx + 1,
              tipe: m.tipeMotor,
              warna: m.warna,
              noMesin: m.noMesin,
              noRangka: m.noRangka,
              namaPart: p.namaPart,
              kerusakan: p.jenisKerusakan,
              penyebab: p.penyebab,
              fotoPart: p.fotoPart,
            }))
          ),
        };

        // Simpan / update ke Local Storage + IndexedDB (tanpa panggil backend/spreadsheet)
        saveLocalDraft(user.kodeAhm, localDraftClaimItem);
        saveActiveWizardSession(user.kodeAhm, null);

        // Animasi persentase mulus menuju 100% (~180ms)
        setSubmitProgress(70);
        await new Promise((r) => setTimeout(r, 50));
        setSubmitProgress(90);
        await new Promise((r) => setTimeout(r, 50));
        setSubmitProgress(100);
        await new Promise((r) => setTimeout(r, 60));

        setIsSubmitting(false);
        setSubmittingStatus(null);
        setSubmitProgress(0);
        onSubmitSuccess(localDraftId, 'Draft', localDraftClaimItem);
        return;
      }

      // ============================================================================
      // JIKA STATUS DIKIRIM KE MD:
      // 1. Generate Official Id Klaim (CLM-xxx) hanya pada titik ini
      // 2. Kirim data ke backend / Google Spreadsheet (INSERT)
      // 3. Tandai localDraftId sebagai SUBMITTED & hapus dari daftar draft aktif
      // 4. Jika gagal/offline, pertahankan draft lokal & tampilkan pesan error
      // ============================================================================
      if (!pendingOfficialIdRef.current) {
        pendingOfficialIdRef.current = generateOfficialClaimId();
      }
      let officialClaimId = pendingOfficialIdRef.current;

      const payload: SimpanKlaimPayload = {
        idKlaim: officialClaimId,
        localDraftId,
        user,
        status: 'Dikirim ke MD',
        lastStep: currentStep,
        step1: {
          noSj,
          tglDo,
          tglPemeriksaan,
          namaSopirPJ,
          nopolPJ,
          transporterPJ,
          parafSopir,
          fotoSopirPJ: sanitizedFotoSopir,
        },
        motors: sanitizedMotors,
        step3: {
          metode: metodeKembali,
          namaSopirKembali: finalNamaSopirKembali,
          nopolKembali: finalNopolKembali,
          transporterKembali: finalTransporterKembali,
          parafUser,
        },
      };

      const newClaimItem: ClaimItem = {
        idKlaim: officialClaimId,
        localDraftId,
        isLocalDraft: false,
        createdAt: initialDraft?.createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
        rawTimestamp: Date.now(),
        rawDate: payload.step1.tglPemeriksaan || now.toISOString().split('T')[0],
        tgl: `${dateFormatted} ${timeFormatted} WIB`,
        tglSelesai: '',
        status: 'Dikirim ke MD',
        lastStep: currentStep,
        noSj: payload.step1.noSj,
        tglDo: payload.step1.tglDo,
        tglPeriksa: payload.step1.tglPemeriksaan,
        kodeAhm: user.kodeAhm,
        kodeDealer: user.kodeDealer || initialDraft?.kodeDealer,
        namaDealer: user.namaDealer,
        sopirPJ: payload.step1.namaSopirPJ,
        nopolPJ: payload.step1.nopolPJ,
        transporterPJ: payload.step1.transporterPJ,
        parafSopirPJ: payload.step1.parafSopir,
        fotoSopirPJ: payload.step1.fotoSopirPJ,
        metodeKembali: payload.step3.metode,
        sopirKembali: payload.step3.namaSopirKembali,
        nopolKembali: payload.step3.nopolKembali,
        transporterKembali: payload.step3.transporterKembali,
        parafUser: payload.step3.parafUser,
        draftDeadline: '',
        kontakPengurusPJ: '',
        kontakPengurusKembali: '',
        kontakRepairman: '',
        kontakKaGudang: '',
        noHpPdi: user.noHp,
        items: payload.motors.flatMap((m, mIdx) =>
          m.parts.map((p) => ({
            indexMotor: mIdx + 1,
            tipe: m.tipeMotor,
            warna: m.warna,
            noMesin: m.noMesin,
            noRangka: m.noRangka,
            namaPart: p.namaPart,
            kerusakan: p.jenisKerusakan,
            penyebab: p.penyebab,
            fotoPart: p.fotoPart,
          }))
        ),
      };

      setSubmitProgress((prev) => Math.max(prev, 52));
      const progressInterval = setInterval(() => {
        setSubmitProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + Math.floor(Math.random() * 9) + 5;
        });
      }, 45);

      try {
        const { GasService } = await import('../services/gasBridge');
        const res = await GasService.simpanPengajuanKlaim(payload);
        if (!res || res.success === false) {
          throw new Error(res?.message || 'Gagal menyimpan klaim ke Google Spreadsheet.');
        }

        if (res.idKlaim) {
          officialClaimId = res.idKlaim;
          newClaimItem.idKlaim = res.idKlaim;
        }

        hasSubmittedRef.current = true;
        clearInterval(progressInterval);
        setSubmitProgress(100);

        // Tandai local draft sebagai SUBMITTED dan hapus dari daftar draft aktif
        clearSubmittedDraft(user.kodeAhm, localDraftId, officialClaimId, noSj);
        saveActiveWizardSession(user.kodeAhm, null);
        recordMutationLock(newClaimItem);

        setTimeout(() => {
          setIsSubmitting(false);
          setSubmittingStatus(null);
          setSubmitProgress(0);
          onSubmitSuccess(officialClaimId, 'Dikirim ke MD', newClaimItem);
        }, 150);
      } catch (err: any) {
        clearInterval(progressInterval);
        console.error('[ClaimWizard] Gagal mengirim ke MD:', err);

        // Pastikan draft lokal tetap tersimpan utuh dan TIDAK dihapus / TIDAK ditandai SUBMITTED
        saveLocalDraft(user.kodeAhm, {
          ...newClaimItem,
          idKlaim: localDraftId,
          localDraftId,
          isLocalDraft: true,
          status: 'Draft',
          draftDeadline: initialDraft?.draftDeadline || new Date(Date.now() + 24 * 3600000).toISOString(),
        });

        setIsSubmitting(false);
        setSubmittingStatus(null);
        setSubmitProgress(0);
        setErrorMessage(
          err?.message ||
            'Tidak dapat mengirim ke MD. Silakan periksa koneksi internet. Draft Anda tetap aman tersimpan di perangkat lokal.'
        );
      }
    } catch (err) {
      clearInterval(preCompressTimer);
      console.error('[ClaimWizard] Save error:', err);
      setErrorMessage('Terjadi kesalahan saat memproses data klaim. Silakan coba lagi.');
      setIsSubmitting(false);
      setSubmittingStatus(null);
      setSubmitProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-red-950 text-white pb-16">
      {/* Wizard Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-3.5 py-2.5 bg-slate-950/85 backdrop-blur-md border-b border-white/10">
        <button
          type="button"
          onClick={() => setShowCancelModal(true)}
          className="p-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Batal
        </button>

        <div className="text-center">
          <h2 className="text-xs font-bold text-white tracking-wide">
            {initialDraft ? 'Lanjutkan Draft Klaim' : 'Form Pengajuan Klaim Cacat'}
          </h2>
          <span className="text-[10px] text-amber-400 font-mono">Langkah {currentStep} dari 3</span>
        </div>

        <div className="w-16 text-right">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="text-xs text-white/70 hover:text-white font-medium"
            >
              Kembali
            </button>
          )}
        </div>
      </div>

      {/* 3-Step Progress Pills */}
      <div className="px-3.5 py-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { step: 1, label: 'Dokumen & PJ' },
            { step: 2, label: 'Unit & Part' },
            { step: 3, label: 'Pengembalian' },
          ].map((s) => {
            const isDone = s.step < currentStep;
            const isCurrent = s.step === currentStep;
            return (
              <div
                key={s.step}
                className={`py-1 px-1.5 rounded-lg border text-center transition-all ${
                  isCurrent
                    ? 'bg-red-600 border-red-400 text-white font-bold shadow-md shadow-red-900/50'
                    : isDone
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 font-semibold'
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                <span className="text-[9.5px] block leading-tight truncate">
                  {isDone ? `✓ ${s.label}` : `${s.step}. ${s.label}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-3.5 mb-2 p-2 rounded-xl border border-red-500/40 bg-red-950/70 text-red-200 text-[11px] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: DOKUMEN & PENANGGUNG JAWAB BONGKAR */}
      {currentStep === 1 && (
        <div className="px-3.5 pb-20">
          <div className="rounded-2xl p-3 bg-white/10 border border-white/15 backdrop-blur-md space-y-2.5 shadow-xl">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-white/90">
                  No. Surat Jalan <span className="text-red-400">*</span>
                </label>
                <span
                  className={`text-[10px] font-mono transition-colors ${
                    noSj.length === 11
                      ? 'text-emerald-400 font-bold'
                      : 'text-white/50'
                  }`}
                >
                  {noSj.length}/11 digit {noSj.length === 11 && '✓'}
                </span>
              </div>
              <input
                id="input-no-sj"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={11}
                value={noSj}
                onChange={(e) => handleNoSjChange(e.target.value)}
                placeholder="11 digit angka"
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs font-mono tracking-wider focus:border-red-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-white/90">
                  Tanggal DO <span className="text-red-400">*</span>
                </label>
                <input
                  id="input-tgl-do"
                  type="date"
                  value={tglDo}
                  onChange={(e) => setTglDo(e.target.value)}
                  className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-white/90">
                  Tanggal Periksa <span className="text-red-400">*</span>
                </label>
                <input
                  id="input-tgl-periksa"
                  type="date"
                  value={tglPemeriksaan}
                  onChange={(e) => setTglPemeriksaan(e.target.value)}
                  className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-400" /> Penanggung Jawab
              </h3>
            </div>

            {/* FOTO BUKTI MENGETAHUI SOPIR (HANYA KAMERA LANGSUNG - SEBELUM KOLOM NAMA) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1">
                  <span>Foto Bukti Mengetahui Sopir</span>
                  <span className="text-red-400">*</span>
                </label>
                {fotoSopirPJ ? (
                  <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Foto Tersedia
                  </span>
                ) : (
                  <span className="text-[9px] text-amber-300 font-medium">
                    Kamera Langsung
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <label
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border ${
                    fotoSopirPJ
                      ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                      : 'border-dashed border-red-500/60 bg-red-950/20 text-white/90'
                  } hover:border-red-400 cursor-pointer text-xs transition-colors shadow-sm`}
                >
                  <Camera className="w-4 h-4 text-red-400" />
                  <span className="font-semibold">
                    {fotoSopirPJ ? 'Ambil Ulang Foto Sopir' : 'Ambil Foto'}
                  </span>
                  {/* Atribut capture="environment" mengunci kamera belakang ponsel tanpa galeri */}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoSopirCapture}
                  />
                </label>

                {fotoSopirPJ && (
                  <div className="w-11 h-11 rounded-lg overflow-hidden border border-emerald-500/50 flex-shrink-0 shadow-md">
                    <img
                      src={fotoSopirPJ}
                      referrerPolicy="no-referrer"
                      alt="Foto Sopir"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              <p className="text-[9.5px] text-white/50 mt-1">
                Wajib mengambil foto fisik sopir penanggung jawab secara langsung di tempat.
              </p>
            </div>

            {/* KOLOM NAMA SOPIR (POSISI SETELAH FOTO) */}
            <div>
              <label className="text-[11px] font-semibold text-white/90">
                Nama Sopir <span className="text-red-400">*</span>
              </label>
              <input
                id="input-nama-sopir-pj"
                type="text"
                value={namaSopirPJ}
                onChange={(e) => setNamaSopirPJ(e.target.value.toUpperCase())}
                placeholder="Nama lengkap sopir ekspedisi"
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs outline-none focus:border-red-500"
              />
            </div>

            <div className="relative" data-dropdown="true">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-white/90">
                  Nomor Polisi <span className="text-red-400">*</span>
                </label>
                {matchedTransporterPJ ? (
                  <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-1.5 py-0.2 rounded">
                    Transporter: {matchedTransporterPJ.transporter}
                  </span>
                ) : isManualNopolPJ ? (
                  <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.2 rounded">
                    Nopol Baru
                  </span>
                ) : null}
              </div>

              <div className="relative mt-0.5">
                {showNopolDropdown && (
                  <div
                    className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl backdrop-blur-md divide-y divide-white/10"
                    style={{ touchAction: 'pan-y' }}
                  >
                    <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                      <span>Pilih Referensi Transporter ({transporterList.length})</span>
                      <button
                        type="button"
                        onClick={() => setShowNopolDropdown(false)}
                        className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                      >
                        ✕
                      </button>
                    </div>
                    {filteredNopolList.length > 0 ? (
                      filteredNopolList.map((item, idx) => (
                        <div
                          key={`${item.nopol}-${idx}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectNopolPJ(item)}
                          className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <Truck className="w-3 h-3 text-amber-400/80" />
                            <span className="font-mono text-xs font-bold text-white tracking-wider">
                              {item.nopol}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-amber-200 border border-white/10">
                            {item.transporter}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                        Nopol belum ada di referensi master.
                      </div>
                    )}
                  </div>
                )}

                <input
                  id="input-nopol-pj"
                  type="text"
                  value={nopolPJ}
                  onChange={(e) => handleNopolPJInput(e.target.value)}
                  onFocus={() => setShowNopolDropdown(true)}
                  placeholder="Pilih atau ketik"
                  className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-black/40 border border-white/20 text-white text-xs font-mono uppercase tracking-wider focus:border-red-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNopolDropdown(!showNopolDropdown)}
                  className="absolute right-1 top-1 bottom-1 px-1.5 flex items-center text-white/50 hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      showNopolDropdown ? 'rotate-180 text-amber-300' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {isManualNopolPJ && (
              <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-500/40">
                <label className="text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                  <span>Pilih Transporter <span className="text-red-400">*</span></span>
                  <span className="text-[9px] text-amber-200/70 font-normal">Nopol baru tersimpan otomatis</span>
                </label>
                <select
                  id="select-manual-transporter"
                  value={transporterPJ}
                  onChange={(e) => handleManualTransporterChange(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-500/50 text-white text-xs font-semibold outline-none focus:border-amber-400"
                >
                  <option value="">-- Pilih Transporter (TM / RJTM / WSS / SBR) --</option>
                  {MANUAL_TRANSPORTERS.map((opt) => (
                    <option key={opt} value={opt} className="bg-slate-900 text-white font-semibold">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pt-1">
              <SignaturePad
                id="canvas-paraf-sopir"
                label="Paraf Sopir"
                required
                height={115}
                hideHint={false}
                value={parafSopir}
                onChange={(base64) => setParafSopir(base64)}
                onClear={() => setParafSopir('')}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: UNIT MOTOR & SUKU CADANG */}
      {currentStep === 2 && (
        <div className="px-3.5 space-y-3 pb-24 relative">
          {motors.map((motor, mIdx) => {
            const isMotorExpanded = activeMotorIndex === mIdx;

            if (!isMotorExpanded) {
              return (
                <div
                  key={mIdx}
                  onClick={() => {
                    setActiveMotorIndex(mIdx);
                    setActivePartIndex((prev) => ({
                      ...prev,
                      [mIdx]: prev[mIdx] !== undefined && prev[mIdx] >= 0 ? prev[mIdx] : 0,
                    }));
                    setActiveDropdown(null);
                  }}
                  className="rounded-xl px-3 py-2.5 bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-between shadow-sm cursor-pointer hover:bg-white/15 transition-all"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 mr-2">
                    <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                      #{mIdx + 1}
                    </div>
                    <div className="truncate text-xs font-semibold text-white">
                      {motor.tipeMotor ? (
                        <span>
                          {motor.tipeMotor}{motor.warna ? ` (${motor.warna})` : ''} •{' '}
                          <span className="font-mono text-white/75">{motor.noMesin || 'No Mesin -'}</span>
                        </span>
                      ) : (
                        <span className="text-white/60 italic">Unit Motor #{mIdx + 1} (Terkunci)</span>
                      )}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-amber-300 font-medium flex-shrink-0">
                      {motor.parts.length} Part
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMotorIndex(mIdx);
                        setActivePartIndex((prev) => ({
                          ...prev,
                          [mIdx]: prev[mIdx] !== undefined && prev[mIdx] >= 0 ? prev[mIdx] : 0,
                        }));
                        setActiveDropdown(null);
                      }}
                      className="text-[10px] text-amber-300 hover:text-amber-200 px-2 py-1 rounded-lg bg-white/10 flex items-center gap-1 font-semibold"
                    >
                      <ChevronDown className="w-3 h-3" />
                      <span>Buka</span>
                    </button>
                    {motors.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMotor(mIdx);
                        }}
                        className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-white/10"
                        title="Hapus Motor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            const rawMotorList = masterData?.motorList || [];
            
            const extractedTipes = Array.from(
              new Set([
                ...rawMotorList.map((m: any) => (m.tipe || m.tipeMotor || '').toString().trim().toUpperCase()),
                ...customTipes,
              ].filter(Boolean))
            );

            const filteredTipeList = extractedTipes.filter((t) =>
              t.includes((motor.tipeMotor || '').trim().toUpperCase())
            );

            const isTipeInputCustom =
              motor.tipeMotor.trim() !== '' &&
              !extractedTipes.some((t) => t.toUpperCase() === motor.tipeMotor.trim().toUpperCase());

            const matchedColorsForTipe = rawMotorList.filter((m: any) => {
              const currentTipe = (m.tipe || m.tipeMotor || '').toString().trim().toUpperCase();
              const inputTipe = (motor.tipeMotor || '').trim().toUpperCase();
              return (
                !inputTipe ||
                currentTipe === inputTipe ||
                currentTipe.replace(/\s+/g, '') === inputTipe.replace(/\s+/g, '')
              );
            });

            const mergedColors = [
              ...matchedColorsForTipe.map((m: any) => ({
                warna: (m.warna || '').toString().trim().toUpperCase(),
                namaWarna: (m.namaWarna || '').toString().trim(),
              })),
              ...customWarnas
                .filter((w) => !motor.tipeMotor || w.tipe.toUpperCase() === motor.tipeMotor.trim().toUpperCase())
                .map((w) => ({ warna: w.warna.toUpperCase(), namaWarna: 'Warna Baru' })),
            ];

            const seenColors = new Set<string>();
            const uniqueColors = mergedColors.filter((c) => {
              if (!c.warna || seenColors.has(c.warna)) return false;
              seenColors.add(c.warna);
              return true;
            });

            const filteredWarnaList = uniqueColors.filter((c) =>
              c.warna.includes((motor.warna || '').trim().toUpperCase()) ||
              c.namaWarna.toUpperCase().includes((motor.warna || '').trim().toUpperCase())
            );

            const isWarnaInputCustom =
              motor.warna.trim() !== '' &&
              !uniqueColors.some((c) => c.warna.toUpperCase() === motor.warna.trim().toUpperCase());

            return (
              <div
                key={mIdx}
                className={`relative rounded-2xl p-3.5 bg-white/10 border border-amber-500/40 backdrop-blur-md space-y-3 shadow-lg ${
                  activeDropdown ? 'z-30' : 'z-10'
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5" /> Unit Motor #{mIdx + 1}
                    <span className="text-[9px] text-emerald-400 font-normal px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
                      Aktif
                    </span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {motors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleLockMotor(mIdx)}
                        className="text-[10px] text-white/90 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 active:scale-95 transition-all font-semibold"
                      >
                        <ChevronUp className="w-3 h-3" /> Kunci
                      </button>
                    )}

                    {motors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMotor(mIdx)}
                        className="text-[11px] text-red-300 hover:text-red-200 flex items-center gap-1 px-2 py-1 rounded-lg bg-red-950/40 border border-red-500/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="relative" data-dropdown="true">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90">
                        Tipe Motor <span className="text-red-400">*</span>
                      </label>
                      {isTipeInputCustom && (
                        <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1 py-0.2 rounded">
                          Tipe Baru
                        </span>
                      )}
                    </div>

                    <div className="relative mt-0.5">
                      {activeDropdown === `motor-tipe-${mIdx}` && (
                        <div
                          className="absolute z-50 left-0 right-0 top-full mt-1 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl divide-y divide-white/10"
                          style={{ touchAction: 'pan-y' }}
                        >
                          <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                            <span>Referensi Master_Motor ({filteredTipeList.length})</span>
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(null)}
                              className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                            >
                              ✕
                            </button>
                          </div>

                          {isTipeInputCustom && (
                            <div
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const clean = motor.tipeMotor.trim().toUpperCase();
                                setCustomTipes((prev) => [...new Set([...prev, clean])]);
                                updateMotor(mIdx, 'tipeMotor', clean);
                                setActiveDropdown(null);
                              }}
                              className="p-2 text-[11px] font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 cursor-pointer flex items-center gap-1.5"
                            >
                              <Plus className="w-3 h-3 text-amber-400" />
                              <span>Gunakan "{motor.tipeMotor}" (Tipe Baru)</span>
                            </div>
                          )}

                          {filteredTipeList.length > 0 ? (
                            filteredTipeList.map((t, idx) => (
                              <div
                                key={`${t}-${idx}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateMotor(mIdx, 'tipeMotor', t);
                                  setActiveDropdown(null);
                                }}
                                className="px-2.5 py-1.5 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                              >
                                <span className="font-semibold text-[11px] text-white uppercase truncate mr-2">
                                  {t}
                                </span>
                                {motor.tipeMotor.toUpperCase() === t.toUpperCase() && (
                                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                )}
                              </div>
                            ))
                          ) : (
                            !isTipeInputCustom && (
                              <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                                Tipe motor tidak ditemukan di master.
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <input
                        type="text"
                        value={motor.tipeMotor}
                        onChange={(e) => {
                          updateMotor(mIdx, 'tipeMotor', e.target.value.toUpperCase());
                          setActiveDropdown(`motor-tipe-${mIdx}`);
                        }}
                        onFocus={() => setActiveDropdown(`motor-tipe-${mIdx}`)}
                        placeholder="Pilih / ketik tipe motor..."
                        className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-black/40 border border-white/20 text-white text-xs uppercase tracking-wide focus:border-red-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdown(
                            activeDropdown === `motor-tipe-${mIdx}` ? null : `motor-tipe-${mIdx}`
                          )
                        }
                        className="absolute right-1 top-1 bottom-1 px-1.5 flex items-center text-white/50 hover:text-white transition-colors"
                        tabIndex={-1}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            activeDropdown === `motor-tipe-${mIdx}` ? 'rotate-180 text-amber-300' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="relative" data-dropdown="true">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90">
                        Warna Motor <span className="text-red-400">*</span>
                      </label>
                      {isWarnaInputCustom ? (
                        <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1 py-0.2 rounded">
                          Warna Baru
                        </span>
                      ) : (
                        motor.tipeMotor && (
                          <span className="text-[9px] text-amber-300/80 font-normal">
                            {uniqueColors.length} opsi
                          </span>
                        )
                      )}
                    </div>

                    <div className="relative mt-0.5">
                      {activeDropdown === `motor-warna-${mIdx}` && (
                        <div
                          className="absolute z-50 left-0 right-0 top-full mt-1 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl divide-y divide-white/10"
                          style={{ touchAction: 'pan-y' }}
                        >
                          <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                            <span>
                              {motor.tipeMotor
                                ? `Warna ${motor.tipeMotor} (${filteredWarnaList.length})`
                                : `Pilih Warna (${filteredWarnaList.length})`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(null)}
                              className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                            >
                              ✕
                            </button>
                          </div>

                          {!motor.tipeMotor && (
                            <div className="p-2 text-[10px] text-amber-300/90 text-center bg-amber-950/30">
                              ⚠️ Pilih Tipe Motor terlebih dahulu.
                            </div>
                          )}

                          {isWarnaInputCustom && (
                            <div
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const clean = motor.warna.trim().toUpperCase();
                                setCustomWarnas((prev) => [
                                  ...prev,
                                  { tipe: motor.tipeMotor || 'ALL', warna: clean },
                                ]);
                                updateMotor(mIdx, 'warna', clean);
                                setActiveDropdown(null);
                              }}
                              className="p-2 text-xs font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 cursor-pointer flex items-center gap-1.5"
                            >
                              <Plus className="w-3 h-3 text-amber-400" />
                              <span>Gunakan "{motor.warna}" (Warna Baru)</span>
                            </div>
                          )}

                          {filteredWarnaList.length > 0 ? (
                            filteredWarnaList.map((w, idx) => (
                              <div
                                key={`${w.warna}-${idx}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateMotor(mIdx, 'warna', w.warna);
                                  setActiveDropdown(null);
                                }}
                                className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                              >
                                <div>
                                  <span className="font-semibold text-xs text-white uppercase block leading-tight">
                                    {w.warna}
                                  </span>
                                  {w.namaWarna && w.namaWarna !== 'Warna Baru' && (
                                    <span className="text-[10px] text-white/60 block leading-tight">
                                      {w.namaWarna}
                                    </span>
                                  )}
                                </div>
                                {motor.warna.toUpperCase() === w.warna.toUpperCase() && (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </div>
                            ))
                          ) : (
                            !isWarnaInputCustom && (
                              <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                                Warna tidak ditemukan di master.
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <input
                        type="text"
                        value={motor.warna}
                        onChange={(e) => {
                          updateMotor(mIdx, 'warna', e.target.value.toUpperCase());
                          setActiveDropdown(`motor-warna-${mIdx}`);
                        }}
                        onFocus={() => setActiveDropdown(`motor-warna-${mIdx}`)}
                        placeholder="Pilih / ketik warna..."
                        className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-black/40 border border-white/20 text-white text-xs uppercase tracking-wide focus:border-red-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdown(
                            activeDropdown === `motor-warna-${mIdx}` ? null : `motor-warna-${mIdx}`
                          )
                        }
                        className="absolute right-1 top-1 bottom-1 px-1.5 flex items-center text-white/50 hover:text-white transition-colors"
                        tabIndex={-1}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            activeDropdown === `motor-warna-${mIdx}` ? 'rotate-180 text-amber-300' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-semibold text-white/90">
                      No. Mesin <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={motor.noMesin}
                        onChange={(e) => updateMotor(mIdx, 'noMesin', e.target.value.toUpperCase())}
                        placeholder="KF81E..."
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/20 text-white text-xs font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => triggerScan(mIdx, 'noMesin')}
                        className="px-3 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1 shadow"
                      >
                        <Barcode className="w-3.5 h-3.5" /> Scan
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-white/90">
                      No. Rangka <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={motor.noRangka}
                        onChange={(e) => updateMotor(mIdx, 'noRangka', e.target.value.toUpperCase())}
                        placeholder="MH1KF81..."
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/20 text-white text-xs font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => triggerScan(mIdx, 'noRangka')}
                        className="px-3 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1 shadow"
                      >
                        <Barcode className="w-3.5 h-3.5" /> Scan
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/80 uppercase">
                      Daftar Part Cacat ({motor.parts.length})
                    </span>
                  </div>

                  {motor.parts.map((part, pIdx) => {
                    const currentActivePartIdx = activePartIndex[mIdx] ?? (motor.parts.length - 1);
                    const isPartExpanded = currentActivePartIdx === pIdx;

                    const rawPartList = masterData?.partList || [];

                    const matchedPartsForTipe = rawPartList.filter((p: any) => {
                      const pTipe = (p.tipe || p.tipeMotor || 'ALL').toString().trim().toUpperCase();
                      const inputTipe = (motor.tipeMotor || '').trim().toUpperCase();
                      return (
                        pTipe === 'ALL' ||
                        !inputTipe ||
                        pTipe === inputTipe ||
                        pTipe.replace(/\s+/g, '') === inputTipe.replace(/\s+/g, '')
                      );
                    });

                    const mergedParts = [
                      ...matchedPartsForTipe.map((p: any) => (p.namaPart || '').toString().trim().toUpperCase()),
                      ...customParts
                        .filter((cp) => cp.tipe === 'ALL' || !motor.tipeMotor || cp.tipe.toUpperCase() === motor.tipeMotor.trim().toUpperCase())
                        .map((cp) => cp.namaPart.toUpperCase()),
                    ];

                    const uniqueParts = Array.from(new Set(mergedParts.filter(Boolean)));
                    const filteredPartList = uniqueParts.filter((pn) =>
                      pn.includes((part.namaPart || '').trim().toUpperCase())
                    );

                    const isPartInputCustom =
                      part.namaPart.trim() !== '' &&
                      !uniqueParts.some((pn) => pn.toUpperCase() === part.namaPart.trim().toUpperCase());

                    const rawKerusakan = masterData?.kerusakanList || [];
                    
                    const uniqueKerusakans = Array.from(
                      new Set([...rawKerusakan.map((k) => k.trim().toUpperCase()), ...customKerusakans].filter(Boolean))
                    );
                    const filteredKerusakanList = uniqueKerusakans.filter((k) =>
                      k.includes((part.jenisKerusakan || '').trim().toUpperCase())
                    );
                    const isKerusakanCustom =
                      part.jenisKerusakan.trim() !== '' &&
                      !uniqueKerusakans.some((k) => k.toUpperCase() === part.jenisKerusakan.trim().toUpperCase());

                    const rawPenyebab = masterData?.penyebabList || [];

                    const uniquePenyebabs = Array.from(
                      new Set([...rawPenyebab.map((p) => p.trim().toUpperCase()), ...customPenyebabs].filter(Boolean))
                    );
                    const filteredPenyebabList = uniquePenyebabs.filter((p) =>
                      p.includes((part.penyebab || '').trim().toUpperCase())
                    );
                    const isPenyebabCustom =
                      part.penyebab.trim() !== '' &&
                      !uniquePenyebabs.some((p) => p.toUpperCase() === part.penyebab.trim().toUpperCase());

                    if (!isPartExpanded) {
                      return (
                        <div
                          key={pIdx}
                          onClick={() => {
                            setActivePartIndex((prev) => ({
                              ...prev,
                              [mIdx]: pIdx,
                            }));
                            setActiveDropdown(null);
                          }}
                          className="rounded-lg px-2.5 py-2 bg-black/40 border border-white/15 flex items-center justify-between cursor-pointer hover:bg-black/60 transition-colors shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0 mr-2 flex-1">
                            <span className="text-[10px] font-bold text-amber-400 flex-shrink-0">
                              Part #{pIdx + 1}:
                            </span>
                            <span className="text-xs text-white truncate font-medium">
                              {part.namaPart || <span className="text-white/40 italic">Part belum dipilih</span>}
                              {part.jenisKerusakan && (
                                <span className="text-white/60 font-normal"> • {part.jenisKerusakan}</span>
                              )}
                            </span>
                            {part.fotoPart ? (
                              <span className="text-[9px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                                <Camera className="w-2.5 h-2.5" /> Foto OK
                              </span>
                            ) : (
                              <span className="text-[9px] text-red-300 bg-red-950/70 border border-red-500/50 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0 animate-pulse font-medium">
                                <AlertCircle className="w-2.5 h-2.5 text-red-400" /> Wajib Foto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePartIndex((prev) => ({
                                  ...prev,
                                  [mIdx]: pIdx,
                                }));
                                setActiveDropdown(null);
                              }}
                              className="text-[10px] text-amber-300 hover:text-amber-200 px-2 py-0.5 rounded bg-white/10 font-semibold"
                            >
                              Edit
                            </button>
                            {motor.parts.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePart(mIdx, pIdx);
                                }}
                                className="p-1 text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={pIdx}
                        className="rounded-xl p-3 bg-black/40 border border-amber-500/40 space-y-2.5 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1.5">
                            <span>Part #{pIdx + 1}</span>
                            <span className="text-[9px] text-emerald-400 font-normal px-1 rounded bg-emerald-950/60 border border-emerald-500/30">
                              Sedang Diedit
                            </span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            {motor.parts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleLockPart(mIdx, pIdx)}
                                className="text-[9px] text-white/90 hover:text-white px-2 py-0.5 rounded bg-white/15 flex items-center gap-1 border border-white/20 active:scale-95 transition-all font-semibold"
                              >
                                <ChevronUp className="w-2.5 h-2.5" /> Kunci
                              </button>
                            )}

                            {motor.parts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePart(mIdx, pIdx)}
                                className="text-[10px] text-red-400 hover:text-red-300 px-1"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="relative" data-dropdown="true">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-semibold text-white/80">
                              Nama Part <span className="text-red-400">*</span>
                            </label>
                            {isPartInputCustom ? (
                              <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1 py-0.2 rounded">
                                Part Baru
                              </span>
                            ) : (
                              motor.tipeMotor && (
                                <span className="text-[9px] text-amber-300/80 font-normal">
                                  Katalog {motor.tipeMotor}
                                </span>
                              )
                            )}
                          </div>

                          <div className="relative mt-0.5">
                            {activeDropdown === `part-nama-${mIdx}-${pIdx}` && (
                              <div
                                className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl divide-y divide-white/10"
                                style={{ touchAction: 'pan-y' }}
                              >
                                <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                                  <span>
                                    {motor.tipeMotor
                                      ? `Part ${motor.tipeMotor} (${filteredPartList.length})`
                                      : `Pilih Part (${filteredPartList.length})`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveDropdown(null)}
                                    className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {isPartInputCustom && (
                                  <div
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      const clean = part.namaPart.trim().toUpperCase();
                                      setCustomParts((prev) => [
                                        ...prev,
                                        { tipe: motor.tipeMotor || 'ALL', namaPart: clean },
                                      ]);
                                      updatePart(mIdx, pIdx, 'namaPart', clean);
                                      setActiveDropdown(null);
                                    }}
                                    className="p-2 text-xs font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Plus className="w-3 h-3 text-amber-400" />
                                    <span>Gunakan "{part.namaPart}" (Part Baru)</span>
                                  </div>
                                )}

                                {filteredPartList.length > 0 ? (
                                  filteredPartList.map((pName, idx) => (
                                    <div
                                      key={`${pName}-${idx}`}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        updatePart(mIdx, pIdx, 'namaPart', pName);
                                        setActiveDropdown(null);
                                      }}
                                      className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                                    >
                                      <span className="font-semibold text-xs text-white uppercase">{pName}</span>
                                      {part.namaPart.toUpperCase() === pName.toUpperCase() && (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  !isPartInputCustom && (
                                    <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                                      Part tidak ditemukan di katalog.
                                    </div>
                                  )
                                )}
                              </div>
                            )}

                            <input
                              type="text"
                              value={part.namaPart}
                              onChange={(e) => {
                                updatePart(mIdx, pIdx, 'namaPart', e.target.value.toUpperCase());
                                setActiveDropdown(`part-nama-${mIdx}-${pIdx}`);
                              }}
                              onFocus={() => setActiveDropdown(`part-nama-${mIdx}-${pIdx}`)}
                              placeholder="Pilih / ketik nama part..."
                              className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-slate-900 border border-white/20 text-white text-xs uppercase tracking-wide focus:border-red-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setActiveDropdown(
                                  activeDropdown === `part-nama-${mIdx}-${pIdx}`
                                    ? null
                                    : `part-nama-${mIdx}-${pIdx}`
                                )
                              }
                              className="absolute right-1 top-1 bottom-1 px-1.5 flex items-center text-white/50 hover:text-white transition-colors"
                              tabIndex={-1}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${
                                  activeDropdown === `part-nama-${mIdx}-${pIdx}`
                                    ? 'rotate-180 text-amber-300'
                                    : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative" data-dropdown="true">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-semibold text-white/80">
                                Jenis Kerusakan <span className="text-red-400">*</span>
                              </label>
                              {isKerusakanCustom && (
                                <span className="text-[8px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1 rounded">
                                  Baru
                                </span>
                              )}
                            </div>

                            <div className="relative mt-0.5">
                              {activeDropdown === `part-kerusakan-${mIdx}-${pIdx}` && (
                                <div
                                  className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl divide-y divide-white/10"
                                  style={{ touchAction: 'pan-y' }}
                                >
                                  <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                                    <span>Pilih Kerusakan ({filteredKerusakanList.length})</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveDropdown(null)}
                                      className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {isKerusakanCustom && (
                                    <div
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        const clean = part.jenisKerusakan.trim().toUpperCase();
                                        setCustomKerusakans((prev) => [...new Set([...prev, clean])]);
                                        updatePart(mIdx, pIdx, 'jenisKerusakan', clean);
                                        setActiveDropdown(null);
                                      }}
                                      className="p-2 text-[11px] font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 cursor-pointer flex items-center gap-1.5"
                                    >
                                      <Plus className="w-3 h-3 text-amber-400" />
                                      <span>Gunakan "{part.jenisKerusakan}" (Baru)</span>
                                    </div>
                                  )}

                                  {filteredKerusakanList.length > 0 ? (
                                    filteredKerusakanList.map((k, idx) => (
                                      <div
                                        key={`${k}-${idx}`}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updatePart(mIdx, pIdx, 'jenisKerusakan', k);
                                          setActiveDropdown(null);
                                        }}
                                        className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                                      >
                                        <span className="font-semibold text-[11px] text-white uppercase">{k}</span>
                                        {part.jenisKerusakan.toUpperCase() === k.toUpperCase() && (
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    !isKerusakanCustom && (
                                      <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                                        Kerusakan tidak ditemukan.
                                      </div>
                                    )
                                  )}
                                </div>
                              )}

                              <input
                                type="text"
                                value={part.jenisKerusakan}
                                onChange={(e) => {
                                  updatePart(mIdx, pIdx, 'jenisKerusakan', e.target.value.toUpperCase());
                                  setActiveDropdown(`part-kerusakan-${mIdx}-${pIdx}`);
                                }}
                                onFocus={() => setActiveDropdown(`part-kerusakan-${mIdx}-${pIdx}`)}
                                placeholder="Pilih kerusakan..."
                                className="w-full px-2 py-1.5 pr-7 rounded-lg bg-slate-900 border border-white/20 text-white text-[11px] uppercase tracking-wide focus:border-red-500 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveDropdown(
                                    activeDropdown === `part-kerusakan-${mIdx}-${pIdx}`
                                      ? null
                                      : `part-kerusakan-${mIdx}-${pIdx}`
                                  )
                                }
                                className="absolute right-1 top-1 bottom-1 px-1 flex items-center text-white/50 hover:text-white transition-colors"
                                tabIndex={-1}
                              >
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    activeDropdown === `part-kerusakan-${mIdx}-${pIdx}`
                                      ? 'rotate-180 text-amber-300'
                                      : ''
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          <div className="relative" data-dropdown="true">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-semibold text-white/80">
                                Penyebab Cacat <span className="text-red-400">*</span>
                              </label>
                              {isPenyebabCustom && (
                                <span className="text-[8px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1 rounded">
                                  Baru
                                </span>
                              )}
                            </div>

                            <div className="relative mt-0.5">
                              {activeDropdown === `part-penyebab-${mIdx}-${pIdx}` && (
                                <div
                                  className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl divide-y divide-white/10"
                                  style={{ touchAction: 'pan-y' }}
                                >
                                  <div className="p-1.5 bg-slate-950/95 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10 z-10">
                                    <span>Pilih Penyebab ({filteredPenyebabList.length})</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveDropdown(null)}
                                      className="text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/10"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {isPenyebabCustom && (
                                    <div
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => {
                                        const clean = part.penyebab.trim().toUpperCase();
                                        setCustomPenyebabs((prev) => [...new Set([...prev, clean])]);
                                        updatePart(mIdx, pIdx, 'penyebab', clean);
                                        setActiveDropdown(null);
                                      }}
                                      className="p-2 text-[11px] font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 cursor-pointer flex items-center gap-1.5"
                                    >
                                      <Plus className="w-3 h-3 text-amber-400" />
                                      <span>Gunakan "{part.penyebab}" (Baru)</span>
                                    </div>
                                  )}

                                  {filteredPenyebabList.length > 0 ? (
                                    filteredPenyebabList.map((p, idx) => (
                                      <div
                                        key={`${p}-${idx}`}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updatePart(mIdx, pIdx, 'penyebab', p);
                                          setActiveDropdown(null);
                                        }}
                                        className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                                      >
                                        <span className="font-semibold text-[11px] text-white uppercase">{p}</span>
                                        {part.penyebab.toUpperCase() === p.toUpperCase() && (
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    !isPenyebabCustom && (
                                      <div className="p-2.5 text-[10px] text-amber-300/80 text-center">
                                        Penyebab tidak ditemukan.
                                      </div>
                                    )
                                  )}
                                </div>
                              )}

                              <input
                                type="text"
                                value={part.penyebab}
                                onChange={(e) => {
                                  updatePart(mIdx, pIdx, 'penyebab', e.target.value.toUpperCase());
                                  setActiveDropdown(`part-penyebab-${mIdx}-${pIdx}`);
                                }}
                                onFocus={() => setActiveDropdown(`part-penyebab-${mIdx}-${pIdx}`)}
                                placeholder="Pilih penyebab..."
                                className="w-full px-2 py-1.5 pr-7 rounded-lg bg-slate-900 border border-white/20 text-white text-[11px] uppercase tracking-wide focus:border-red-500 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveDropdown(
                                    activeDropdown === `part-penyebab-${mIdx}-${pIdx}`
                                      ? null
                                      : `part-penyebab-${mIdx}-${pIdx}`
                                  )
                                }
                                className="absolute right-1 top-1 bottom-1 px-1 flex items-center text-white/50 hover:text-white transition-colors"
                                tabIndex={-1}
                              >
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    activeDropdown === `part-penyebab-${mIdx}-${pIdx}`
                                      ? 'rotate-180 text-amber-300'
                                      : ''
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-semibold text-white/90">
                              Foto Cacat Part <span className="text-red-400">*</span>
                            </label>
                            {part.fotoPart ? (
                              <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                              </span>
                            ) : (
                              <span className="text-[9px] text-red-400 flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <label
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border ${
                                part.fotoPart
                                  ? 'border-emerald-500/40 bg-emerald-950/20'
                                  : 'border-dashed border-red-500/60 bg-red-950/20'
                              } hover:border-red-400 cursor-pointer text-xs text-white/90 transition-colors shadow-sm`}
                            >
                              <Camera className="w-4 h-4 text-red-400" />
                              <span>{part.fotoPart ? 'Ubah Foto Cacat Part' : 'Foto Cacat Part *'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload(mIdx, pIdx, e)}
                              />
                            </label>

                            {part.fotoPart && (
                              <div className="w-12 h-12 rounded-lg overflow-hidden border border-emerald-500/50 flex-shrink-0 shadow-md">
                                <img
                                  src={part.fotoPart}
                                  referrerPolicy="no-referrer"
                                  alt="Foto Part"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => handleAddPartWithValidation(mIdx)}
                            className="w-full py-2 px-3 rounded-xl border border-dashed border-amber-400/50 hover:bg-amber-400/10 active:scale-98 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors bg-white/5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Tambah Part Lainnya
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(activePartIndex[mIdx] ?? -1) === -1 && (
                    <button
                      type="button"
                      onClick={() => handleAddPartWithValidation(mIdx)}
                      className="w-full py-2 px-3 rounded-xl border border-dashed border-amber-400/50 hover:bg-amber-400/10 active:scale-98 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors bg-white/5 cursor-pointer mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Part
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addMotor}
            className="w-full py-2.5 rounded-2xl border border-dashed border-amber-400/50 hover:bg-amber-400/10 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah Unit Motor Lainnya
          </button>
        </div>
      )}

      {/* STEP 3: PENGEMBALIAN & PARAF USER */}
      {currentStep === 3 && (
        <div className="px-4 space-y-4 pb-28">
          <div className="rounded-2xl p-4 bg-white/10 border border-white/15 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Metode Pengembalian Part
              </h3>
              {isMethodLocked && (
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded-full">
                  🔒 Terkunci (Mode Edit Draft)
                </span>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-white/90">
                Pilih Metode Pengembalian <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5 mt-1.5">
                <button
                  type="button"
                  disabled={isMethodLocked}
                  onClick={() => handleSelectMetodeKembali('DIKIRIM LANGSUNG')}
                  className={`py-2 px-3 rounded-xl border text-center transition-all text-xs font-bold ${
                    metodeKembali === 'DIKIRIM LANGSUNG'
                      ? 'bg-red-600 border-red-400 text-white shadow-md shadow-red-900/50'
                      : 'bg-black/30 border-white/15 text-white/70 hover:border-white/30'
                  } ${isMethodLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-98'}`}
                >
                  DIKIRIM LANGSUNG
                </button>

                <button
                  type="button"
                  disabled={isMethodLocked}
                  onClick={() => handleSelectMetodeKembali('DITITIP')}
                  className={`py-2 px-3 rounded-xl border text-center transition-all text-xs font-bold ${
                    metodeKembali === 'DITITIP'
                      ? 'bg-red-600 border-red-400 text-white shadow-md shadow-red-900/50'
                      : 'bg-black/30 border-white/15 text-white/70 hover:border-white/30'
                  } ${isMethodLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-98'}`}
                >
                  DITITIP
                </button>
              </div>
            </div>

            {metodeKembali === 'DIKIRIM LANGSUNG' && (
              <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-1 animate-fadeIn">
                <div className="text-xs text-white/90 font-medium">
                  {namaSopirPJ || 'Sopir Awal'} •{' '}
                  <span className="font-mono text-amber-300 font-bold">{nopolPJ || '-'}</span>{' '}
                  <span className="text-white/60">({transporterPJ || '-'})</span>
                </div>
              </div>
            )}

            {metodeKembali === 'DITITIP' && (
              <div className="space-y-3 pt-1 animate-fadeIn">
                <div>
                  <label className="text-[11px] font-semibold text-white/90">
                    Nama Sopir Pengembalian / Titipan <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="input-nama-sopir-kembali"
                    type="text"
                    value={namaSopirKembali}
                    onChange={(e) => setNamaSopirKembali(e.target.value.toUpperCase())}
                    placeholder="Nama sopir pengambil part titipan"
                    className="w-full mt-1 px-2.5 py-2 rounded-xl bg-black/40 border border-white/20 text-white text-xs outline-none focus:border-red-500"
                  />
                </div>

                <div className="relative" data-dropdown="true">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-white/90">
                      Nomor Polisi Pengembalian <span className="text-red-400">*</span>
                    </label>
                    {matchedTransporterKembali ? (
                      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-1.5 py-0.2 rounded">
                        Transporter: {matchedTransporterKembali.transporter}
                      </span>
                    ) : isManualNopolKembali ? (
                      <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.2 rounded">
                        Nopol Baru
                      </span>
                    ) : null}
                  </div>

                  <div className="relative mt-1">
                    {showNopolKembaliDropdown && (
                      <div
                        className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-slate-900 border border-white/25 shadow-2xl backdrop-blur-md divide-y divide-white/10"
                        style={{ touchAction: 'pan-y' }}
                      >
                        <div className="p-1.5 bg-slate-950/90 text-[10px] font-bold text-amber-300 flex items-center justify-between sticky top-0 border-b border-white/10">
                          <span>Referensi Master Transporter ({transporterList.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowNopolKembaliDropdown(false)}
                            className="text-white/60 hover:text-white px-1"
                          >
                            ✕
                          </button>
                        </div>
                        {filteredNopolKembaliList.length > 0 ? (
                          filteredNopolKembaliList.map((item, idx) => (
                            <div
                              key={`${item.nopol}-${idx}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelectNopolKembali(item)}
                              className="px-2.5 py-2 flex items-center justify-between hover:bg-red-600/35 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3 h-3 text-amber-400/80" />
                                <span className="font-mono text-xs font-bold text-white tracking-wider">
                                  {item.nopol}
                                </span>
                              </div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-amber-200 border border-white/10">
                                {item.transporter}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-2 text-[10px] text-amber-300/80 text-center">
                            Nopol belum terdaftar di Master.
                          </div>
                        )}
                      </div>
                    )}

                    <input
                      id="input-nopol-kembali"
                      type="text"
                      value={nopolKembali}
                      onChange={(e) => handleNopolKembaliInput(e.target.value)}
                      onFocus={() => setShowNopolKembaliDropdown(true)}
                      placeholder="Pilih atau ketik nopol (misal: B 9285 UIP)"
                      className="w-full px-2.5 py-2 pr-8 rounded-xl bg-black/40 border border-white/20 text-white text-xs font-mono uppercase tracking-wider focus:border-red-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNopolKembaliDropdown(!showNopolKembaliDropdown)}
                      className="absolute right-1 top-1 bottom-1 px-1.5 flex items-center text-white/50 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showNopolKembaliDropdown ? 'rotate-180 text-amber-300' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isManualNopolKembali && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40">
                    <label className="text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                      <span>Pilih Transporter Pengembalian <span className="text-red-400">*</span></span>
                      <span className="text-[9px] text-amber-200/70 font-normal">Nopol baru tersimpan otomatis</span>
                    </label>
                    <select
                      id="select-manual-transporter-kembali"
                      value={transporterKembali}
                      onChange={(e) => handleManualTransporterKembaliChange(e.target.value)}
                      className="w-full mt-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-500/50 text-white text-xs font-semibold outline-none focus:border-amber-400"
                    >
                      <option value="">-- Pilih Transporter (TM / RJTM / WSS / YSS / SBR) --</option>
                      {MANUAL_TRANSPORTERS.map((opt) => (
                        <option key={opt} value={opt} className="bg-slate-900 text-white font-semibold">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-3 bg-white/10 border border-white/15 backdrop-blur-md">
            <SignaturePad
              id="canvas-paraf-user"
              label={`Paraf Petugas PDI Dealer (${user.nama || 'PDI Man'})`}
              required
              height={115}
              hideHint={false}
              value={parafUser}
              onChange={(base64) => setParafUser(base64)}
              onClear={() => setParafUser('')}
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-white/15 p-3">
        {/* Progress Bar Laser Kilatan Modern */}
        {isSubmitting && (
          <div className="max-w-md mx-auto mb-2 overflow-hidden rounded-full bg-black/50 h-1.5 border border-amber-400/30 p-[1px]">
            <div
              className="bg-gradient-to-r from-red-500 via-amber-300 to-emerald-400 h-full transition-all duration-75 ease-out rounded-full shadow-[0_0_12px_rgba(251,191,36,0.9)]"
              style={{ width: `${submitProgress}%` }}
            />
          </div>
        )}

        <div className="max-w-md mx-auto flex items-center gap-2">
          {currentStep < 3 ? (
            <>
              <button
                type="button"
                onClick={() => handleSaveClaim('Draft')}
                disabled={isSubmitting}
                className={`relative overflow-hidden flex-1 py-3 rounded-xl border text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                  isSubmitting && submittingStatus === 'Draft'
                    ? 'border-amber-400/60 bg-amber-950/85 mdc-btn-flash-amber cursor-wait'
                    : 'border-white/20 bg-white/10 hover:bg-white/15 active:scale-98'
                }`}
              >
                {isSubmitting && submittingStatus === 'Draft' && (
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600/80 via-amber-500/75 to-yellow-400/55 transition-all duration-75 ease-out pointer-events-none"
                    style={{ width: `${submitProgress}%` }}
                  />
                )}
                <div className="relative z-10 flex items-center justify-center gap-1.5">
                  {isSubmitting && submittingStatus === 'Draft' ? (
                    <>
                      {submitProgress >= 100 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                      ) : (
                        <Zap className="w-4 h-4 text-amber-200 fill-amber-200 animate-pulse" />
                      )}
                      <span>{submitProgress >= 100 ? 'Tersimpan!' : 'Menyimpan Draft'}</span>
                      <span className="font-mono font-extrabold text-amber-100 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                        {submitProgress}%
                      </span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-amber-300" />
                      <span>Simpan Draft</span>
                    </>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-98 text-white text-xs font-bold shadow-lg shadow-red-900/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Lanjutkan
              </button>
            </>
          ) : (
            <>
              {metodeKembali === 'DITITIP' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveClaim('Draft')}
                    disabled={isSubmitting}
                    className={`relative overflow-hidden flex-1 py-3 rounded-xl border text-amber-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:cursor-not-allowed ${
                      isSubmitting && submittingStatus === 'Draft'
                        ? 'border-amber-400/60 bg-amber-900/90 mdc-btn-flash-amber cursor-wait'
                        : 'border-amber-500/30 bg-amber-950/60 hover:bg-amber-900/70 active:scale-98'
                    }`}
                  >
                    {isSubmitting && submittingStatus === 'Draft' && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600/80 via-amber-500/75 to-yellow-400/55 transition-all duration-75 ease-out pointer-events-none"
                        style={{ width: `${submitProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-1.5">
                      {isSubmitting && submittingStatus === 'Draft' ? (
                        <>
                          {submitProgress >= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                          ) : (
                            <Zap className="w-4 h-4 text-amber-200 fill-amber-200 animate-pulse" />
                          )}
                          <span>{submitProgress >= 100 ? 'Tersimpan!' : 'Menyimpan'}</span>
                          <span className="font-mono font-extrabold text-amber-100 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                            {submitProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-amber-300" />
                          <span>Simpan Draft</span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveClaim('Dikirim ke MD')}
                    disabled={isSubmitting}
                    className={`relative overflow-hidden flex-1 py-3 rounded-xl text-white text-xs font-bold shadow-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      isSubmitting && submittingStatus === 'Dikirim ke MD'
                        ? 'bg-red-900/90 mdc-btn-flash-red border border-amber-400/50 cursor-wait'
                        : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-98 shadow-red-900/50'
                    }`}
                  >
                    {isSubmitting && submittingStatus === 'Dikirim ke MD' && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/80 via-red-500/85 to-amber-500/60 transition-all duration-100 ease-out pointer-events-none"
                        style={{ width: `${submitProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-1.5">
                      {isSubmitting && submittingStatus === 'Dikirim ke MD' ? (
                        <>
                          {submitProgress >= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                          ) : (
                            <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                          )}
                          <span>{submitProgress >= 100 ? 'Terkirim!' : 'Mengirim ke MD'}</span>
                          <span className="font-mono font-extrabold text-amber-200 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                            {submitProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Kirim ke MD</span>
                        </>
                      )}
                    </div>
                  </button>
                </>
              ) : metodeKembali === 'DIKIRIM LANGSUNG' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveClaim('Draft')}
                    disabled={isSubmitting}
                    className={`relative overflow-hidden flex-1 py-3 rounded-xl border text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      isSubmitting && submittingStatus === 'Draft'
                        ? 'border-amber-400/60 bg-amber-950/85 mdc-btn-flash-amber cursor-wait'
                        : 'border-white/20 bg-white/10 hover:bg-white/15 active:scale-98'
                    }`}
                  >
                    {isSubmitting && submittingStatus === 'Draft' && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600/80 via-amber-500/75 to-yellow-400/55 transition-all duration-75 ease-out pointer-events-none"
                        style={{ width: `${submitProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-1.5">
                      {isSubmitting && submittingStatus === 'Draft' ? (
                        <>
                          {submitProgress >= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                          ) : (
                            <Zap className="w-4 h-4 text-amber-200 fill-amber-200 animate-pulse" />
                          )}
                          <span>{submitProgress >= 100 ? 'Tersimpan!' : 'Menyimpan'}</span>
                          <span className="font-mono font-extrabold text-amber-100 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                            {submitProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-amber-300" />
                          <span>Simpan Draft</span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveClaim('Dikirim ke MD')}
                    disabled={isSubmitting}
                    className={`relative overflow-hidden flex-1 py-3 rounded-xl text-white text-xs font-bold shadow-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      isSubmitting && submittingStatus === 'Dikirim ke MD'
                        ? 'bg-red-900/90 mdc-btn-flash-red border border-amber-400/50 cursor-wait'
                        : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-98 shadow-red-900/50'
                    }`}
                  >
                    {isSubmitting && submittingStatus === 'Dikirim ke MD' && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600/80 via-red-500/85 to-amber-500/60 transition-all duration-100 ease-out pointer-events-none"
                        style={{ width: `${submitProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-1.5">
                      {isSubmitting && submittingStatus === 'Dikirim ke MD' ? (
                        <>
                          {submitProgress >= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                          ) : (
                            <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                          )}
                          <span>{submitProgress >= 100 ? 'Terkirim!' : 'Mengirim ke MD'}</span>
                          <span className="font-mono font-extrabold text-amber-200 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                            {submitProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Kirim ke MD</span>
                        </>
                      )}
                    </div>
                  </button>
                </>
              ) : (
                <div className="w-full flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveClaim('Draft')}
                    disabled={isSubmitting}
                    className={`relative overflow-hidden flex-1 py-3 rounded-xl border text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      isSubmitting && submittingStatus === 'Draft'
                        ? 'border-amber-400/60 bg-amber-950/85 mdc-btn-flash-amber cursor-wait'
                        : 'border-white/20 bg-white/10 hover:bg-white/15 active:scale-98'
                    }`}
                  >
                    {isSubmitting && submittingStatus === 'Draft' && (
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600/80 via-amber-500/75 to-yellow-400/55 transition-all duration-75 ease-out pointer-events-none"
                        style={{ width: `${submitProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-1.5">
                      {isSubmitting && submittingStatus === 'Draft' ? (
                        <>
                          {submitProgress >= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                          ) : (
                            <Zap className="w-4 h-4 text-amber-200 fill-amber-200 animate-pulse" />
                          )}
                          <span>{submitProgress >= 100 ? 'Tersimpan!' : 'Menyimpan'}</span>
                          <span className="font-mono font-extrabold text-amber-100 tracking-wider bg-black/45 px-1.5 py-0.5 rounded text-[11px] border border-amber-300/40">
                            {submitProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-amber-300" />
                          <span>Simpan Draft</span>
                        </>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled
                    className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-bold cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    Pilih Metode Dahulu
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      {/* Modal Konfirmasi Batal Pengisian Klaim */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-b from-neutral-900 via-slate-900 to-red-950 p-6 shadow-2xl text-white text-center ring-1 ring-white/10">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-3 shadow-lg shadow-amber-950/60">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Batalkan Pengisian Klaim?
            </h3>
            <p className="text-xs text-white/70 mb-5 leading-relaxed">
              Data formulir yang sudah Anda ketik belum tersimpan dan akan hilang jika Anda membatalkannya sekarang.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold text-white/80 transition-all border border-white/15 cursor-pointer"
              >
                Lanjut Mengisi
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  saveActiveWizardSession(user.kodeAhm, null);
                  onCancel();
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:brightness-110 active:scale-95 text-xs font-bold text-white shadow-md shadow-red-950/80 transition-all cursor-pointer"
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};