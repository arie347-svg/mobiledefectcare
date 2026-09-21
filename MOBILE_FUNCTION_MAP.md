# EXHAUSTIVE MOBILE FUNCTION & google.script.run MAPPING
**Dokumen:** `MOBILE_FUNCTION_MAP.md`  
**Sumber:** `Index.txt` (Frontend Mobile Eksisting)  
**Status:** 100% EXHAUSTIVE VERIFIED

---

## 1. Pemetaan Lengkap Alur Interaksi UI Mobile

Setiap interaksi pengguna di UI Mobile dipetakan secara terperinci dari event pemicu sampai perubahan UI:

```text
[UI Action / Event Pemicu]
       ↓
[Client-Side JavaScript Function]
       ↓
[google.script.run.withSuccessHandler().withFailureHandler()]
       ↓
[Backend GAS Function]
       ↓
[Parameter yang Dikirim]
       ↓
[Hasil Kembalian (Return Payload)]
       ↓
[Dampak pada UI & State Client]
```

---

### Alur 1: Autentikasi Login Pengguna
* **Pemicu UI:** Pengguna menekan tombol "Masuk" (`#btnLogin`) pada form login `#formLogin`.
* **Client Function:** `handleLoginSubmit(e)`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .withFailureHandler(function(err) { ... })
    .loginUser(email, kodeAhm);
  ```
* **Parameters Dikirim:**
  1. `email`: String (diambil dari `#loginEmail`, dinormalisasi lowercase)
  2. `kodeAhm`: String (diambil dari `#loginKodeAhm`)
* **Backend Function:** `loginUser(email, kodeAhm)` di `Code.gs`
* **Success Handler Behavior:**
  * Jika `res.status === 'SUCCESS'`:
    * Simpan profile ke in-memory `currentUserProfile = res.user;`
    * Simpan session ke `localStorage`: `mdc_is_logged_in='true'`, `mdc_user_profile=JSON.stringify(...)`, `mdc_has_verified='true'`.
    * Jika checkbox `#rememberMe` checked: simpan `mdc_remember='true'`, `mdc_saved_email`, `mdc_saved_kode_ahm`.
    * Panggil `loadMasterData()`.
    * Panggil `renderDashboard(currentUserProfile)`.
  * Jika `res.status !== 'SUCCESS'`:
    * Tampilkan pesan error di `#loginAlertBox`: `res.message || "Kredensial tidak cocok."`.
    * Reset tombol login dari loading state kembali ke default.
* **Failure Handler Behavior:**
  * Tampilkan `#loginAlertBox`: `"Gagal menghubungi server: " + err.message`.
  * Kembalikan state tombol login.

---

### Alur 2: Lookup Kode AHM pada Formulir Registrasi
* **Pemicu UI:** Pengguna menekan tombol "Cari" (`#btnCari`) atau menekan tombol Enter pada `#kodeAhm`.
* **Client Function:** `triggerLookup()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .withFailureHandler(function(err) { ... })
    .lookupKodeAhm(kodeAhm);
  ```
* **Parameters Dikirim:** `kodeAhm`: String (diambil dari input `#kodeAhm`)
* **Backend Function:** `lookupKodeAhm(kodeAhm)` di `Code.gs`
* **Success Handler Behavior:**
  * Jika `res.found === true`:
    * Isi nilai otomatis pada `#namaDealer`, `#kodeDealer`, `#kategori`, `#kota`, `#sentraDistribusi`.
    * Set flag `isDealerValid = true` dan `lastVerifiedKodeAhm = kodeAhm`.
    * Tampilkan feedback hijau: `"Dealer ditemukan"`.
    * Panggil `checkFormValidity()` untuk mengaktifkan tombol Submit jika field lain lengkap.
  * Jika `res.found === false`:
    * Kosongkan field detail dealer melalui `resetDealerFields()`.
    * Set `isDealerValid = false`.
    * Tampilkan feedback merah: `"Kode AHM tidak terdaftar"`.
* **Failure Handler Behavior:**
  * Tampilkan pesan error koneksi pada `#ahmFeedback`.

---

### Alur 3: Pendaftaran Akun Dealer Baru
* **Pemicu UI:** Pengguna menekan tombol `#btnSubmit` pada form `#formRegistrasi`.
* **Client Function:** `handleFormSubmit(e)`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .withFailureHandler(function(err) { ... })
    .registerUser(payload);
  ```
* **Parameters Dikirim:**
  ```javascript
  payload = {
    email: string,
    namaLengkap: string (UPPERCASE),
    noHp: string,
    kodeAhm: string,
    namaDealer: string,
    kodeDealer: string,
    kategori: string,
    kota: string,
    sentraDistribusi: string,
    role: 'PDI Man'
  }
  ```
* **Backend Function:** `registerUser(formData)` di `Code.gs`
* **Success Handler Behavior:**
  * Simpan profile ke `localStorage` (`mdc_is_logged_in`, `mdc_user_profile`, dll).
  * Panggil `loadMasterData()`.
  * Panggil `renderDashboard(currentUserProfile)`.
* **Failure Handler Behavior:**
  * Buka modal dialog `triggerCustomAlert("Kesalahan Server", err.message)`.
  * Aktifkan kembali tombol submit.

---

### Alur 4: Pengambilan Master Data Form Klaim
* **Pemicu UI:** Terpicu otomatis saat login berhasil atau saat inisialisasi sesi tersimpan (`DOMContentLoaded`).
* **Client Function:** `loadMasterData()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .getMasterDataKlaim();
  ```
* **Parameters Dikirim:** *None*
* **Backend Function:** `getMasterDataKlaim()` di `Code.gs`
* **Success Handler Behavior:**
  * Simpan objek ke cache memori `masterDataCache = res;`.
  * Data ini digunakan oleh form wizard untuk autocomplete/dropdown:
    * `masterDataCache.transporterList` &rarr; Sugesti Nopol & Vendor
    * `masterDataCache.motorList` &rarr; Sugesti Tipe Motor & Warna
    * `masterDataCache.partList` &rarr; Sugesti Nama Part per Tipe Motor
    * `masterDataCache.kerusakanList` &rarr; Sugesti Jenis Kerusakan
    * `masterDataCache.penyebabList` &rarr; Sugesti Penyebab Kerusakan

---

### Alur 5: Pengambilan Statistik Pipeline Dashboard
* **Pemicu UI:** Dipanggil di dalam `loadMasterData()`, setelah pengajuan klaim baru, atau saat heartbeat update.
* **Client Function:** Di dalam `loadMasterData()`:
  ```javascript
  google.script.run
    .withSuccessHandler(renderDashboardStats)
    .getDashboardStats(currentUserProfile.kodeAhm);
  ```
* **Parameters Dikirim:** `currentUserProfile.kodeAhm`: String
* **Backend Function:** `getDashboardStats(kodeAhm)` di `Code.gs`
* **Success Handler (`renderDashboardStats`):**
  * Update angka pada kartu dashboard: `#countDraft`, `#countKirimMD`, `#countProsesMD`, `#countKirimDealer`, `#countSelesai`.
  * Jika `stats.draft > 0`: tambahkan kelas CSS `.siren-slow-pulse` pada `#cardDraft` dan munculkan badge merah `#sirenBadge`.
  * Jika `stats.draft === 0`: hapus animasi pulse dan sembunyikan badge.

---

### Alur 6: Pengambilan Riwayat Daftar Klaim Dealer
* **Pemicu UI:** Dipanggil saat render dashboard, setelah refresh, setelah simpan klaim, atau setelah konfirmasi selesai.
* **Client Function:** `loadRecentClaims()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(rawRes) { ... })
    .withFailureHandler(function(err) { ... })
    .getRecentClaims(currentUserProfile.kodeAhm);
  ```
* **Parameters Dikirim:** `currentUserProfile.kodeAhm`: String
* **Backend Function:** `getRecentClaims(kodeAhm)` di `Code.gs`
* **Success Handler Behavior:**
  * Parsing data: jika `typeof rawRes === 'string'`, jalankan `JSON.parse(rawRes)`.
  * Simpan ke cache: `allClaimsCache = res.data || [];`.
  * Eksekusi `renderClaimsList()` untuk merender kartu klaim di UI (dengan filtering & sorting).
* **Failure Handler Behavior:**
  * Render pesan error di kontainer `#recentClaimsList`: `"Koneksi terputus: " + err.message`.

---

### Alur 7: Simpan Pengajuan Klaim (Baru / Draft / Lanjutan)
* **Pemicu UI:** Pengguna menekan tombol "Kirim Pengajuan" / "Simpan Draft" (`#btnSubmitKlaim`) pada Step 3 Form Wizard.
* **Client Function:** `submitKlaimWizard()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .withFailureHandler(function(err) { ... })
    .simpanPengajuanKlaim(payload);
  ```
* **Parameters Dikirim:** Objek `payload` lengkap (diverifikasi di Bab 3).
* **Backend Function:** `simpanPengajuanKlaim(payload)` di `Code.gs`
* **Success Handler Behavior:**
  * Hentikan spinner tombol submit.
  * Tampilkan alert sukses modal: `"Data berhasil disimpan sebagai DRAFT"` atau `"Pengajuan klaim berhasil DIKIRIM KE MD!"`.
  * Tutup form wizard (`#sectionClaimWizard.classList.add("d-none")`) dan buka dashboard.
  * Reset form melalui `resetClaimForm()`.
  * Muat ulang data terbaru: `loadMasterData()` dan `loadRecentClaims()`.
* **Failure Handler Behavior:**
  * Hentikan spinner tombol submit.
  * Buka modal dialog `triggerCustomAlert("Kesalahan Server", err.message)`.

---

### Alur 8: Konfirmasi Penerimaan Part oleh Dealer (Penyelesaian Klaim)
* **Pemicu UI:** PDI Man menekan tombol "Konfirmasi Selesai" (`#btnEksekusiSelesaiDealer`) di dalam `#modalValidasiPenerimaanDealer`.
* **Client Function:** `eksekusiKonfirmasiSelesai()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .dealerKonfirmasiSelesai(activeKlaimSelesaiId);
  ```
* **Parameters Dikirim:** `activeKlaimSelesaiId`: String ID Klaim (contoh: `'CLM-1726200000000'`)
* **Backend Function:** `dealerKonfirmasiSelesai(idKlaim)` di `Code.gs` / `ServiceMD.gs`
* **Success Handler Behavior:**
  * Tutup modal validasi terima.
  * Tampilkan alert: `"Part berhasil diterima dan status klaim ditutup (Selesai)."`.
  * Muat ulang dashboard stats dan daftar klaim (`loadMasterData()` & `loadRecentClaims()`).

---

### Alur 9: Deteksi Heartbeat Sinkronisasi Versi Data Real-Time
* **Pemicu UI:** Timer interval otomatis setiap 10 detik (`initMobileAutoSync()`).
* **Client Function:** Interval function di dalam `initMobileAutoSync()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(res) { ... })
    .checkDataVersion(localMobileDataVersion);
  ```
* **Parameters Dikirim:** `localMobileDataVersion`: String (versi timestamp server saat ini)
* **Backend Function:** `checkDataVersion(clientVersion)` di `Code.gs`
* **Success Handler Behavior:**
  * Jika `res.isOutdated === true`:
    * Update versi lokal: `localMobileDataVersion = res.serverVersion;`.
    * Jalankan `silentReloadMobileClaims()`: memanggil `getRecentClaims()` dan `getDashboardStats()` secara silent tanpa memblokir UI pengguna.

---

### Alur 10: Navigasi Antara Mobile dan Portal Web MD
* **Pemicu UI:** Pengguna menekan tombol "Web Version - Main Dealer" (`#btnNavWeb`).
* **Client Function:** `navigasiKeHalamanWeb()`
* **`google.script.run` Invocation:**
  ```javascript
  google.script.run
    .withSuccessHandler(function(fullUrl) { ... })
    .withFailureHandler(function(err) { ... })
    .getAppUrl('md');
  ```
* **Parameters Dikirim:** `'md'` (target query string)
* **Backend Function:** `getAppUrl(targetPage)` di `Code.gs`
* **Success Handler Behavior:**
  * Dapatkan `fullUrl` dari server.
  * Jika browser di URL `/dev`, ganti `/exec` menjadi `/dev`.
  * Redirect top window: `window.top.location.href = finalUrl;`.
* **Failure Handler Behavior:**
  * Kembalikan animasi radar tombol dan tampilkan alert gagal.
