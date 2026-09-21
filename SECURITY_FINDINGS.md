# MDC SYSTEM — SECURITY FINDINGS REPORT
**Dokumen:** `SECURITY_FINDINGS.md`  
**Status:** AUDITED & REPORTED (TIDAK DIPERBAIKI PADA FASE INI SESUAI MANDAT)  
**Lingkup:** Arsitektur Keamanan, Autentikasi, Otorisasi, Penyimpanan Foto, dan Eksekusi Runtime GAS

---

## Ringkasan Eksekutif

Sistem Mobile Defect Care (MDC) saat ini mengandalkan Google Apps Script (GAS) sebagai backend serverless dan Google Spreadsheet sebagai database tabular. Berdasarkan audit mendalam terhadap `Code.txt`, `ServiceMD.txt`, `ServiceMaster.txt`, dan `Appsscript.txt`, ditemukan beberapa karakteristik keamanan penting.

Sesuai aturan mutlak proyek:
> **"JANGAN memperbaikinya otomatis dalam proyek frontend ini. Buat SECURITY_FINDINGS.md dan laporkan terpisah."**

Berikut adalah temuan lengkap tanpa mengubah kode backend atau arsitektur yang sudah berjalan:

---

## Temuan Keamanan Mendalam

### SEC-01: Otentikasi Pengguna Mobile Tanpa Kata Sandi / PIN
* **Tingkat Risiko:** **MEDIUM-HIGH**
* **Lokasi Kode:** `Code.txt` baris 108–157 (`loginUser`)
* **Deskripsi:**
  Fungsi `loginUser(email, kodeAhm)` memvalidasi login pengguna mobile (PDI Man Dealer) murni berdasarkan kesamaan nilai:
  ```javascript
  if (rowEmail === targetEmail) {
    if (rowKodeAhm === targetKodeAhm) {
      return { status: 'SUCCESS', user: { ... } };
    }
  }
  ```
  Tidak ada verifikasi kata sandi (password), PIN, maupun OTP berbasis WhatsApp/Email.
* **Potensi Ancaman:**
  Jika seseorang mengetahui alamat email staf PDI Man dan Kode AHM Dealer terkait (informasi yang sering kali bersifat publik atau internal organisasi), orang tersebut dapat masuk ke aplikasi atas nama staf tersebut.
* **Catatan Arsitektur:**
  Berbeda dengan portal desktop `Users_Web` yang telah diamankan dengan kriptografi `SHA-256 + Salt` (`hashPasswordMDC`), tabel `User_Mobile` saat ini tidak memiliki kolom kata sandi. Perubahan autentikasi memerlukan penambahan kolom di database spreadsheet yang saat ini **dilarang untuk diubah**.

---

### SEC-02: Otorisasi Berbasis Parameter Client (Missing Server-Side Session Verification pada Mobile)
* **Tingkat Risiko:** **MEDIUM**
* **Lokasi Kode:** `Code.txt` baris 499–666 (`getRecentClaims(kodeAhm)`)
* **Deskripsi:**
  Fungsi `getRecentClaims(kodeAhm)` menerima parameter `kodeAhm` langsung dari pemanggilan client-side:
  ```javascript
  google.script.run.getRecentClaims(currentUserProfile.kodeAhm);
  ```
  Pada sisi backend:
  ```javascript
  function getRecentClaims(kodeAhm) {
    const targetAhm = cleanKodeAhm(kodeAhm);
    for (let i = headerData.length - 1; i >= 1; i--) {
      // Menyaring baris yang cocok dengan targetAhm
    }
  }
  ```
  Tidak ada validasi apakah pemanggil request benar-benar pemilik `kodeAhm` tersebut (tidak ada token sesi server-side seperti `verifyAdminToken` yang ada pada `ServiceMaster.gs`).
* **Potensi Ancaman:**
  Jika seseorang memodifikasi pemanggilan fungsi di console browser dan mengirimkan `kodeAhm` dealer lain, backend akan mengembalikan seluruh riwayat klaim dari dealer tersebut.
* **Rekomendasi Mendatang:**
  Menerapkan mekanisme session token di `CacheService` server-side untuk user mobile seperti yang telah diimplementasikan pada admin di `Users_Web`.

---

### SEC-03: Penyimpanan Foto Part Menggunakan Izin Tautan Publik (`ANYONE_WITH_LINK`)
* **Tingkat Risiko:** **LOW-MEDIUM**
* **Lokasi Kode:** `Code.txt` baris 416–436 (`simpanFotoPartDrive`)
* **Deskripsi:**
  Setiap kali foto part diunggah dari mobile, file disimpan di Google Drive folder `"MDC_Foto_Part_Klaim"`, dan izin akses diset ke:
  ```javascript
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/d/" + file.getId();
  ```
* **Potensi Ancaman:**
  URL `lh3.googleusercontent.com/d/{FILE_ID}` dapat dibuka oleh siapa pun di internet yang memiliki link tersebut tanpa perlu login ke akun Google atau MDC.
* **Analisis Kebutuhan Bisnis:**
  Pola ini sengaja digunakan oleh pengembang sistem terdahulu agar foto dapat langsung dirender di tag `<img>` HTML baik pada perangkat mobile maupun desktop WebMD tanpa terbentur cookie third-party iframe Google.

---

### SEC-04: Deployment Web App sebagai `USER_DEPLOYING` & `ANYONE_ANONYMOUS`
* **Tingkat Risiko:** **LOW-MEDIUM**
* **Lokasi Konfigurasi:** `Appsscript.txt` (`appsscript.json`)
  ```json
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
  ```
* **Deskripsi:**
  Semua eksekusi skrip berjalan dengan wewenang (permission) dari akun Google pemilik skrip (Deployer), bukan akun Google pengguna akhir yang membuka link.
* **Dampak Arsitektural:**
  * **Kelebihan Positif:** Pengguna PDI Man di dealer tidak diwajibkan memiliki izin edit langsung ke Google Spreadsheet atau Google Drive. Seluruh operasi database terkontrol lewat logika skrip.
  * **Risiko:** Seluruh endpoint publik yang terbuka di web app dapat dieksekusi tanpa login akun Google, sehingga validasi parameter di tingkat aplikasi menjadi satu-satunya pelindung.

---

### SEC-05: Paparan Data Sensitif pada Heartbeat Versioning
* **Tingkat Risiko:** **LOW / INFORMATIONAL**
* **Lokasi Kode:** `Code.txt` baris 724–731 (`checkDataVersion`)
* **Deskripsi:**
  Heartbeat polling hanya mengembalikan stempel waktu versi:
  ```javascript
  return {
    isOutdated: serverVersion.toString() !== (clientVersion || '').toString(),
    serverVersion: serverVersion
  };
  ```
* **Evaluasi:**
  Mekanisme ini **SANGAT BAIK DAN AMAN**. Heartbeat tidak mengirimkan data klaim atau data pengguna apa pun, melainkan hanya string timestamp angka (`LAST_DATA_VERSION`), sehingga menghemat kuota GAS dan tidak membocorkan data sensitif saat polling berkala 10 detik.

---

## Rekomendasi Disiplin Frontend Mobile Baru
1. **Zero Authorization Logic in Frontend:** Frontend Mobile baru tidak boleh mengasumsikan hak akses. Hak akses sepenuhnya dikendalikan oleh backend GAS.
2. **No Sensitive Caching in Service Worker:** Service Worker PWA tidak boleh meng-cache response API klaim, data profile pengguna, nomor WA pribadi, maupun foto part. Cache hanya diperuntukkan bagi aset statis aplikasi (shell app, CSS, icon).
