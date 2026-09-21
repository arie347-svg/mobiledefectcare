# DATABASE & SPREADSHEET MAPPING SPECIFICATION
**Dokumen:** `DATABASE_MAPPING.md`  
**Sumber:** `Code.txt`, `ServiceMD.txt`, `ServiceMaster.txt`, `Struktur Spreadsheet.txt`  
**Spreadsheet ID:** `1Xy9095taEr4EQC7dWqOj_nPjaIDNsxyf6k6eN7Tb3Mc`  
**Status:** 100% STRICTLY VERIFIED

---

## 1. Verifikasi Lengkap Tabel Utama & Relasi

```text
[Master_Dealer]
 (PK: Kode AHM)
       │
       │ 1:N
       ├─────────────────────────────────────────────┐
       ▼                                             ▼
 [User_Mobile]                                [Klaim_Header]
  (FK: Kode AHM)                               (PK: Id Klaim, FK: Kode AHM)
                                                     │
                                                     │ 1:N
                                                     ▼
                                              [Klaim_Detail]
                                               (PK: Id Detail, FK: Id Klaim)
```

---

## 2. Pemetaan Eksak 29 Kolom `Klaim_Header`

Berdasarkan `Code.txt` baris 394–425 dan `ServiceMD.txt` baris 10–43 (`COLS_KLAIM`), berikut adalah indeks dan sumber data eksak untuk setiap kolom:

| Indeks Array (0-based) | Huruf Kolom Spreadsheet | Nama Kolom Header di Spreadsheet | Tipe Data Aktual | Sumber Payload Frontend / Logika Backend | Deskripsi & Validasi |
|---|---|---|---|---|---|
| **0** | **A** | `Id Klaim` | String | `payload.idKlaim \|\| ('CLM-' + new Date().getTime())` | Primary Key unik. Contoh: `CLM-1773412345678` |
| **1** | **B** | `Timestamp` | Datetime / Date | `new Date()` | Waktu server saat baris disimpan |
| **2** | **C** | `Status` | String (Enum) | `payload.status` | `'Draft'`, `'Dikirim ke MD'`, `'Proses di MD'`, `'Dikirim ke Dealer'`, `'Selesai'`, `'Ditolak'` |
| **3** | **D** | `No SJ` | String | `"'" + payload.step1.noSj` | Ditambahkan kutip satu `'` agar tersimpan sebagai teks 11 digit tanpa notasi ilmiah |
| **4** | **E** | `Tgl DO` | Date (YYYY-MM-DD) | `payload.step1.tglDo` | Tanggal Surat Jalan/DO dari input date |
| **5** | **F** | `Tgl Periksa` | Date (YYYY-MM-DD) | `payload.step1.tglPemeriksaan` | **Titik Acuan Perhitungan SLA (7 Hari Kerja)** |
| **6** | **G** | `Kode AHM` | String / Number | `cleanKodeAhm(payload.user.kodeAhm)` | Kode AHM Dealer pengaju klaim (tanpa tanda kutip/spasi) |
| **7** | **H** | `Nama Dealer` | String | `payload.user.namaDealer` | Nama resmi Dealer Honda |
| **8** | **I** | `Sopir PJ` | String (UPPERCASE) | `payload.step1.namaSopirPJ.toUpperCase()` | Nama driver pembawa unit saat bongkar muat DO |
| **9** | **J** | `Nopol PJ` | String (UPPERCASE) | `payload.step1.nopolPJ.toUpperCase()` | Plat nomor armada pengantar saat bongkar muat DO |
| **10** | **K** | `Transporter PJ` | String | `payload.step1.transporterPJ` | Vendor ekspedisi (TM, RJTM, WSS, SBR, dll) |
| **11** | **L** | `Paraf Sopir PJ` | String (Data URL) | `payload.step1.parafSopir` | Tanda tangan digital driver (Base64 PNG Data URL) |
| **12** | **M** | `Metode Kembali` | String | `payload.step3.metode` | `'DIKIRIM LANGSUNG'` atau `'DITITIP'` |
| **13** | **N** | `Sopir Kembali` | String (UPPERCASE) | `payload.step3.namaSopirKembali.toUpperCase()` | Driver pembawa part titipan (atau sama dgn PJ jika Langsung) |
| **14** | **O** | `Nopol Kembali` | String (UPPERCASE) | `payload.step3.nopolKembali.toUpperCase()` | Nopol armada titipan (atau sama dgn PJ jika Langsung) |
| **15** | **P** | `Transporter Kembali`| String | `payload.step3.transporterKembali` | Vendor ekspedisi titipan |
| **16** | **Q** | `Paraf User` | String (Data URL) | `payload.step3.parafUser` | Tanda tangan digital PDI Man pengaju klaim |
| **17** | **R** | `Draft Deadline` | Datetime (String) | Jika Draft: `now + 24 Jam`, else: `""` | Penentu batas sirine denyut merah dashboard |
| **18** | **S** | `MD Status Penerimaan` | String | Diisi oleh `executePenerimaanMD` di Portal MD | Status penerimaan fisik part oleh Repairman |
| **19** | **T** | `MD Jenis Perbaikan` | String | Diisi oleh `executePenerimaanMD` di Portal MD | Repainting (72j) / Ganti Part (120j) + extra hari |
| **20** | **U** | `MD Target Selesai` | Datetime (String) | Diisi oleh `executePenerimaanMD` di Portal MD | Stempel waktu batas target pengerjaan MD |
| **21** | **V** | `MD Approval KaGudang` | String | Diisi oleh `executeApprovalKaGudang` di Portal MD | `'Approved'` / `'Rejected'` oleh Ka. Gudang |
| **22** | **W** | `MD Validasi Repairman`| String | Diisi oleh `executeValidasiPerbaikanMD` di MD | `'Valid'` jika lolos uji mutu QC Repairman |
| **23** | **X** | `MD Sopir Balik` | String (UPPERCASE) | Diisi oleh `executeKirimKeDealerMD` di Portal MD | Driver pengantar part kembali ke dealer |
| **24** | **Y** | `MD Nopol Balik` | String (UPPERCASE) | Diisi oleh `executeKirimKeDealerMD` di Portal MD | Plat nomor armada pengantar part kembali |
| **25** | **Z** | `MD Transporter Balik`| String (UPPERCASE) | Diisi oleh `executeKirimKeDealerMD` di Portal MD | Vendor ekspedisi pengantar part kembali |
| **26** | **AA** | `Tgl Selesai Dealer` | Datetime (String) | Diisi oleh `dealerKonfirmasiSelesai` di Mobile | Waktu PDI Man konfirmasi fisik part telah diterima |
| **27** | **AB** | `MD Komentar SLA` | String | Diisi oleh `saveAlasanKeterlambatan` di MD | Alasan/evaluasi jika penanganan melewati batas SLA |
| **28** | **AC** | `Is Urgent` | String | Diisi oleh `toggleUrgentStatusMD` di Portal MD | Bernilai `'URGENT'` atau `''` (penentu prioritas antrean) |

> **PERINGATAN INTEGRITAS ARSITEKTUR:**  
> Ketika Frontend Mobile melakukan *update* klaim (misalnya memperbarui Draft yang sudah pernah tersimpan), baris 417–421 pada `Code.txt` secara eksplisit **mempertahankan nilai kolom 18 s/d 28 (kolom S sampai AC)** agar tidak menimpa data operasional Main Dealer yang sudah berjalan.

---

## 3. Pemetaan 11 Kolom `Klaim_Detail`

Tabel rincian part kerusakan per unit motor (`Klaim_Detail`) disusun sebagai berikut:

| Indeks Array (0-based) | Nama Kolom Spreadsheet | Sumber Data Frontend Mobile (`payload`) | Format / Transformasi |
|---|---|---|---|
| **0** | `Id Detail` | `idKlaim + '-D' + (mIdx + 1) + '-' + (pIdx + 1) + '-' + Math.floor(Math.random() * 1000)` | Primary Key string unik detail part |
| **1** | `Id Klaim` | `idKlaim` | Foreign Key ke `Klaim_Header.Id Klaim` |
| **2** | `Index Motor` | `mIdx + 1` | Nomor urut unit motor (1, 2, 3, ...) |
| **3** | `Tipe Motor` | `motor.tipeMotor` | Di-uppercase otomatis (`.toUpperCase()`) |
| **4** | `Warna` | `motor.warna` | Di-uppercase otomatis (`.toUpperCase()`) |
| **5** | `No Mesin` | `motor.noMesin` | Ditambahkan petik satu: `"'" + motor.noMesin.toUpperCase()` |
| **6** | `No Rangka` | `motor.noRangka` | Ditambahkan petik satu: `"'" + motor.noRangka.toUpperCase()` |
| **7** | `Nama Part` | `part.namaPart` | Sesuai katalog `Master_Part` atau input manual |
| **8** | `Jenis Kerusakan` | `part.jenisKerusakan` | Sesuai opsi `Master_Kerusakan` |
| **9** | `Penyebab` | `part.penyebab` | Sesuai opsi `Master_Penyebab` |
| **10** | `Foto Part` | `part.fotoPart` (Hasil proses Drive) | URL Google Drive CDN: `https://lh3.googleusercontent.com/d/{FILE_ID}` |

---

## 4. Verifikasi Payload Lengkap `simpanPengajuanKlaim(payload)`

Struktur JSON yang dikirimkan oleh Frontend Mobile saat menyimpan klaim:

```typescript
interface SimpanKlaimPayload {
  idKlaim?: string; // Diisi string "CLM-..." jika mengedit Draft; undefined/null jika pengajuan baru
  status: "Draft" | "Dikirim ke MD";
  user: {
    email: string;
    nama?: string;
    namaDealer: string;
    kodeDealer?: string;
    kodeAhm: string | number;
    kategori?: string;
    kota?: string;
    sentraDistribusi?: string;
    noHp?: string;
    role?: string;
  };
  step1: {
    noSj: string; // Tepat 11 digit angka
    tglDo: string; // YYYY-MM-DD
    tglPemeriksaan: string; // YYYY-MM-DD
    namaSopirPJ: string;
    nopolPJ: string;
    transporterPJ: string;
    parafSopir: string; // Data URL Base64
  };
  motors: Array<{
    tipeMotor: string;
    warna: string;
    noMesin: string;
    noRangka: string;
    parts: Array<{
      namaPart: string;
      jenisKerusakan: string;
      penyebab: string;
      fotoPart: string; // Data URL Base64 (data:image/jpeg;base64,...) ATAU URL Google Drive yang sudah tersimpan
    }>;
  }>;
  step3: {
    metode: "DIKIRIM LANGSUNG" | "DITITIP";
    namaSopirKembali: string;
    nopolKembali: string;
    transporterKembali: string;
    parafUser: string; // Data URL Base64
  };
}
```

---

## 5. Pemetaan Master Tables (Read-Only bagi Mobile)

| Nama Sheet | Kolom Indeks & Deskripsi | Penggunaan di Mobile Frontend |
|---|---|---|
| `Master_Dealer` | [0] Kode AHM, [1] Nama Dealer, [2] Kode Dealer, [3] Kategori, [4] Kota, [5] Sentra Distribusi | Lookup saat registrasi PDI Man baru (`lookupKodeAhm`) dan identifikasi sentra distribusi pada daftar klaim |
| `Master_Transporter`| [0] Id, [1] Transporter, [2] Nomor Polisi, [3] Jenis Truk, [4] Kapasitas, [5] Depo, [6] Kontak Pengurus WA | Sugesti dropdown Nopol armada, autofill vendor transporter, dan kontak WhatsApp pengurus |
| `Master_Motor` | [0] Jenis Motor, [1] Tipe Motor, [2] Warna, [3] Nama Warna Lengkap | Sugesti dropdown Tipe Motor dan filtering Warna motor dinamis |
| `Master_Part` | [0] Tipe Motor, [1] Nama Part | Sugesti dropdown katalog suku cadang tersaring otomatis sesuai Tipe Motor yang dipilih |
| `Master_Kerusakan` | [0] Jenis Kerusakan | Sugesti dropdown opsi kerusakan part |
| `Master_Penyebab` | [0] Penyebab Kerusakan | Sugesti dropdown opsi penyebab cacat unit |
| `Users_Web` | [0] Timestamp, [1] Username, [2] Password, [3] Nama Lengkap, [4] No HP, [5] Sentra Distribusi, [6] Role | Lookup nomor kontak WhatsApp Repairman & Ka. Gudang Main Dealer untuk dihubungi oleh PDI Man |
