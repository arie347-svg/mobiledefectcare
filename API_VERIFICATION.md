# MDC MOBILE — API VERIFICATION REPORT
**Dokumen:** `API_VERIFICATION.md`  
**Status:** VERIFIED AGAINST SOURCE OF TRUTH (`Code.txt`, `Index.txt`, `ServiceMD.txt`, `ServiceMaster.txt`, `Struktur Spreadsheet.txt`)  
**Lingkup:** Verifikasi seluruh fungsi Backend Google Apps Script (GAS) yang dipanggil oleh Frontend Mobile (`Index.html`).

---

## 1. Tabel Verifikasi Fungsi Backend

| Function Name | File Lokasi | Exists? | Parameter Match | Return Value Match | Database / Storage Impact | Authorization Level | Status Verifikasi |
|---|---|---|---|---|---|---|---|
| `loginUser(email, kodeAhm)` | `Code.txt` (L108-L157) | **YES** | `email`: String<br>`kodeAhm`: String/Number | Object:<br>`{ status: 'SUCCESS'\|'FAILED'\|'ERROR', user?: {...}, message?: string }` | Read: `User_Mobile` / `Users_Mobile` | Public / Anonym (PDI Man Dealer) | **VERIFIED** |
| `checkUserByEmail(email)` | `Code.txt` (L160-L197) | **YES** | `email`: String | Object:<br>`{ status: 'REGISTERED'\|'NOT_REGISTERED'\|'ERROR', user?: {...}, message?: string }` | Read: `User_Mobile` / `Users_Mobile` | Public / Anonym (PDI Man Dealer) | **VERIFIED** |
| `lookupKodeAhm(kodeAhm)` | `Code.txt` (L200-L228) | **YES** | `kodeAhm`: String/Number | Object:<br>`{ found: boolean, namaDealer?, kodeDealer?, kategori?, kota?, sentraDistribusi?, role?: 'PDI Man' }` | Read: `Master_Dealer` | Public / Anonym | **VERIFIED** |
| `registerUser(formData)` | `Code.txt` (L231-L272) | **YES** | `formData`: Object (11 properti) | Object:<br>`{ success: boolean, message?: string }` | Write (Append Row): `User_Mobile` / `Users_Mobile`<br>LockService: 10 detik | Public / Anonym (Registrasi baru) | **VERIFIED** |
| `getMasterDataKlaim()` | `Code.txt` (L295-L345) | **YES** | *Tidak ada* (`void`) | Object:<br>`{ success: boolean, transporterList: [...], motorList: [...], partList: [...], kerusakanList: [...], penyebabList: [...], message?: string }` | Read: `Master_Transporter`, `Master_Motor`, `Master_Part`, `Master_Kerusakan`, `Master_Penyebab` | Public / PDI Man Dealer | **VERIFIED** |
| `getDashboardStats(kodeAhm)` | `Code.txt` (L439-L490) | **YES** | `kodeAhm`: String/Number | Object:<br>`{ draft: number, kirimMD: number, prosesMD: number, kirimDealer: number, selesai: number, alertDraft: boolean }` | Read: `Klaim_Header` | Public / Filtered by `kodeAhm` | **VERIFIED** |
| `getRecentClaims(kodeAhm)` | `Code.txt` (L499-L666) | **YES** | `kodeAhm`: String/Number | **JSON String**:<br>`JSON.stringify({ success: boolean, data: ClaimItem[], message?: string })` *(Perhatian: Return value bertipe string JSON)* | Read & Join: `Klaim_Header`, `Klaim_Detail`, `Master_Transporter`, `Master_Dealer`, `User_Mobile`, `Users_Web` | Public / Filtered by `kodeAhm` | **VERIFIED** *(Catatan: Client wajib JSON.parse)* |
| `simpanPengajuanKlaim(payload)` | `Code.txt` (L348-L436) | **YES** | `payload`: Object komprehensif | Object:<br>`{ success: boolean, idKlaim: string, status: string, message?: string }` | 1. Drive: Upload file ke folder `"MDC_Foto_Part_Klaim"`<br>2. Sheet: `Klaim_Header` (Upsert 29 kolom)<br>3. Sheet: `Klaim_Detail` (Batch Insert/Replace)<br>4. Props: `LAST_DATA_VERSION` updated<br>LockService: 15 detik | Public / PDI Man Dealer | **VERIFIED** |
| `dealerKonfirmasiSelesai(idKlaim)` | `Code.txt` (L709-L715) & `ServiceMD.txt` (L35-L38) | **YES** | `idKlaim`: String | Object:<br>`{ success: boolean, message?: string }` | Write (Update Row): `Klaim_Header` kolom 3 (`Status='Selesai'`) & kolom 27 (`Tgl Selesai`)<br>Props: `LAST_DATA_VERSION`<br>LockService: 12 detik | Public / PDI Man Dealer | **VERIFIED** |
| `checkDataVersion(clientVersion)` | `Code.txt` (L724-L731) | **YES** | `clientVersion`: String | Object:<br>`{ isOutdated: boolean, serverVersion: string }` | Read: `PropertiesService.getScriptProperties().getProperty('LAST_DATA_VERSION')` (Tanpa query spreadsheet) | Public / Heartbeat Polling | **VERIFIED** |
| `getAppUrl(targetPage)` | `Code.txt` (L101-L105) | **YES** | `targetPage`: String (`'md'`, `'mobile'`, dsb) | String URL:<br>`ScriptApp.getService().getUrl() + '?page=' + targetPage` | Read: System URL GAS Web App | Public / Navigasi | **VERIFIED** |

---

## 2. Analisis Rinci Setiap Fungsi

### 2.1. `loginUser(email, kodeAhm)`
* **File:** `Code.txt` baris 108–157
* **Signature:** `function loginUser(email, kodeAhm)`
* **Pengecekan Parameter:**
  * Validasi awal: `if (!email || !kodeAhm) return { status: 'FAILED', message: 'Email dan Kode AHM wajib diisi.' };`
  * Normalisasi email: `.toString().toLowerCase().trim()`
  * Normalisasi kode AHM: `.toString().trim()`
* **Struktur Objek Return `user`:**
  ```javascript
  {
    email: targetEmail,
    nama: data[i][2] || '',
    noHp: data[i][3] || '',
    kodeAhm: rowKodeAhm,
    namaDealer: data[i][5] || '',
    kodeDealer: data[i][6] || '',
    kategori: data[i][7] || '',
    kota: data[i][8] || '',
    sentraDistribusi: data[i][9] || '',
    role: 'PDI Man'
  }
  ```
* **Sheet Terlibat:** `User_Mobile` atau fallback `Users_Mobile`.
* **Side Effect:** Tidak ada penulisan database.
* **Authorization:** Sederhana mencocokkan string email dan kode AHM pada satu baris di sheet `User_Mobile`.

### 2.2. `checkUserByEmail(email)`
* **File:** `Code.txt` baris 160–197
* **Signature:** `function checkUserByEmail(email)`
* **Return Value:**
  * Terdaftar: `{ status: 'REGISTERED', user: { ..., role: data[i][10] || 'PDI Man' } }`
  * Tidak terdaftar: `{ status: 'NOT_REGISTERED' }`
* **Sheet Terlibat:** `User_Mobile` / `Users_Mobile`. Kolom ke-11 dibaca sebagai `role`.

### 2.3. `lookupKodeAhm(kodeAhm)`
* **File:** `Code.txt` baris 200–228
* **Signature:** `function lookupKodeAhm(kodeAhm)`
* **Sheet Terlibat:** `Master_Dealer`
  * Kolom [0]: Kode AHM
  * Kolom [1]: Nama Dealer
  * Kolom [2]: Kode Dealer
  * Kolom [3]: Kategori
  * Kolom [4]: Kota
  * Kolom [5]: Sentra Distribusi
* **Return:** `{ found: true, namaDealer, kodeDealer, kategori, kota, sentraDistribusi, role: 'PDI Man' }` atau `{ found: false }`.

### 2.4. `registerUser(formData)`
* **File:** `Code.txt` baris 231–272
* **Signature:** `function registerUser(formData)`
* **Concurrency Lock:** `LockService.getScriptLock().waitLock(10000);`
* **Validasi Duplikasi:** Jika email sudah ada di kolom ke-2 `User_Mobile`, return `{ success: false, message: 'Email ini sudah terdaftar sebelumnya.' }`.
* **Database Impact:** `sheet.appendRow([Timestamp, Email, Nama Lengkap (UPPERCASE), No WA (format 628xx), Kode AHM, Nama Dealer, Kode Dealer, Kategori, Kota, Sentra Distribusi, Role ('PDI Man')])` (11 kolom tepat).

### 2.5. `getMasterDataKlaim()`
* **File:** `Code.txt` baris 295–345
* **Signature:** `function getMasterDataKlaim()`
* **Pemetaan Sheet Master:**
  * `Master_Transporter`: r[1] = Transporter, r[2] = Nopol (UPPERCASE)
  * `Master_Motor`: r[1] = Tipe Motor (UPPERCASE), r[2] = Warna (UPPERCASE), r[3] = Nama Warna
  * `Master_Part`: r[0] = Tipe Motor (UPPERCASE), r[1] = Nama Part
  * `Master_Kerusakan`: r[0] = Jenis Kerusakan (deduplikasi `[...new Set]`)
  * `Master_Penyebab`: r[0] = Penyebab (deduplikasi `[...new Set]`)

### 2.6. `getDashboardStats(kodeAhm)`
* **File:** `Code.txt` baris 439–490
* **Signature:** `function getDashboardStats(kodeAhm)`
* **Kalkulasi Metrik:**
  * Menghitung status dari sheet `Klaim_Header` baris 2: `'Draft'`, `'Dikirim ke MD'`, `'Proses di MD'`, `'Dikirim ke Dealer'`, `'Selesai'`.
  * Deteksi sirine: Jika status `'Draft'` dan `now > deadlineDate` (kolom index 17 `DRAFT_DEADLINE`), maka `alertDraft = true`.

### 2.7. `getRecentClaims(kodeAhm)`
* **File:** `Code.txt` baris 499–666
* **Signature:** `function getRecentClaims(kodeAhm)`
* **PENTING — Format Return:** Mengembalikan **String JSON** (`return JSON.stringify({ success: true, data: claims });`). Frontend wajib mengecek `typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes`.
* **Multi-Table Read & In-Memory Join:**
  1. `Klaim_Header` (Header transaksi klaim)
  2. `Klaim_Detail` (Rincian part dan foto)
  3. `Master_Transporter` (Lookup kontak pengurus berdasarkan nopol)
  4. `Master_Dealer` (Lookup sentra distribusi dealer)
  5. `User_Mobile` (Lookup no HP PDI Man pengaju)
  6. `Users_Web` (Lookup kontak Repairman dan Ka. Gudang sesuai sentra distribusi)

### 2.8. `simpanPengajuanKlaim(payload)`
* **File:** `Code.txt` baris 348–436
* **Signature:** `function simpanPengajuanKlaim(payload)`
* **Dua Tahap Eksekusi (High Concurrency Design):**
  * **Tahap 1 (Tanpa Lock):** Pembuatan file foto ke Google Drive melalui helper `simpanFotoPartDrive()`. Hal ini mencegah script lock macet saat jaringan pengunggahan lambat.
  * **Tahap 2 (Dengan LockService 15 detik):** Kunci `Klaim_Header` & `Klaim_Detail`. Jika update, timpa 29 kolom header (mempertahankan kolom 18-28 milik MD) dan hapus detail lama. Jika baru, append header dan lakukan **batch insert** `setValues(preparedDetailRows)` ke `Klaim_Detail`.
  * **Tahap 3:** Trigger `triggerDataMutation()` & `SpreadsheetApp.flush()`.

### 2.9. `dealerKonfirmasiSelesai(idKlaim)`
* **File:** `Code.txt` baris 709–715 & `ServiceMD.txt` baris 35–38
* **Signature:** `function dealerKonfirmasiSelesai(idKlaim)`
* **Implementasi:** Memanggil `updateKlaimHeaderRow(idKlaim, callback)`.
* **Database Impact:**
  * Kolom [2] (`Status`): diset `'Selesai'`
  * Kolom [26] (`Tgl Selesai Dealer`): diset `Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm")`
  * LockService: 12 detik.
  * Trigger: `triggerDataMutation()`.

### 2.10. `checkDataVersion(clientVersion)`
* **File:** `Code.txt` baris 724–731
* **Signature:** `function checkDataVersion(clientVersion)`
* **Mekanisme Heartbeat:**
  * Membaca `PropertiesService.getScriptProperties().getProperty('LAST_DATA_VERSION')`.
  * Return `{ isOutdated: (serverVersion !== clientVersion), serverVersion: serverVersion }`.
  * Konsumsi kuota eksekusi minimal (sangat ringan).

---

## 3. Kesimpulan Verifikasi

Semua fungsi yang tercantum dalam API contract mobile **TERBUKTI ADA, SESUAI SECARA PARAMETER, DAN COCOK 100%** dengan implementasi aktual pada backend Google Apps Script. Tidak ada fungsi fiktif atau fungsi yang tidak ditemukan di source code MDC.
