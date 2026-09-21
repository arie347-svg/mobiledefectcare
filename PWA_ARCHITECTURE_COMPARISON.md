# PWA ARCHITECTURE COMPARISON — OPTION A vs OPTION B
**Dokumen:** `PWA_ARCHITECTURE_COMPARISON.md`  
**Tujuan:** Evaluasi komparatif mendalam antara dua strategi penyajian frontend mobile modern MDC tanpa mengubah backend GAS dan tanpa mengganggu WebMD.

---

## 1. Ikhtisar Arsitektur Pilihan

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION A: GAS HOSTED MOBILE FRONTEND                                                             │
│                                                                                                  │
│  Browser Android (Chrome)                                                                        │
│         │                                                                                        │
│         ▼                                                                                        │
│  [script.google.com/macros/s/.../exec?page=mobile]                                              │
│         │                                                                                        │
│         ▼                                                                                        │
│  [GAS doGet(e) -> HtmlService.createTemplateFromFile('Index')]                                   │
│         │                                                                                        │
│         ├─► Menyajikan Bundle HTML/CSS/JS Frontend Modern                                        │
│         └─► Komunikasi Data: Native google.script.run (Langsung ke Code.gs)                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION B: EXTERNAL PWA + GAS API BRIDGE                                                          │
│                                                                                                  │
│  Browser Android / PWA Standalone (Domain Mandiri: misal mdc.dealerhonda.com)                    │
│         │                                                                                        │
│         ▼                                                                                        │
│  [Modern Frontend Server / CDN Hosting] (React 19 + PWA Manifest + Service Worker)               │
│         │                                                                                        │
│         ▼                                                                                        │
│  [HTTP REST / JSON Fetch Request]                                                                │
│         │                                                                                        │
│         ▼ (CORS, Redirect 302 Google, Payload Translasi)                                         │
│  [GAS doPost(e) / Web API Bridge] (MEMERLUKAN PERUBAHAN BACKEND GAS)                             │
│         │                                                                                        │
│         ▼                                                                                        │
│  [Code.gs / Spreadsheet / Drive]                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tabel Perbandingan Fitur & Teknis (12 Dimensi)

| Dimensi Evaluasi | OPTION A (GAS Hosted Frontend) | OPTION B (External PWA + API Bridge) |
|---|---|---|
| **1. Autentikasi Pengguna** | Menggunakan `google.script.run.loginUser(email, kodeAhm)`. Kredensial tidak pernah keluar dari ekosistem Google. | Harus membuat wrapper request `POST /login` dengan payload JSON. Rentan CORS jika tidak dikonfigurasi sempurna. |
| **2. Manajemen Sesi (Session)** | Tersimpan di `localStorage` per browser domain sandbox GAS. Sederhana, andal, dan sudah terbukti pada sistem berjalan. | Memerlukan cookie lintas domain (SameSite=None) atau header Authorization `Bearer token` yang dikelola mandiri. |
| **3. Pemanggilan API (API Invocation)** | **Langsung native `google.script.run`**. Bebas dari masalah CORS, bebas dari header HTTP, dan bebas dari konfigurasi server proxy. | Memerlukan `fetch()` ke endpoint URL GAS `doPost(e)`. Google Apps Script selalu merespons `POST` dengan HTTP redirect 302, yang memerlukan handling CORS rumit di browser. |
| **4. Upload Foto Part ke Drive** | Base64 dikirim via parameter `google.script.run.simpanPengajuanKlaim(payload)` langsung ke fungsi backend `simpanFotoPartDrive()`. | Payload Base64 besar (beberapa foto) rentan melanggar limit request payload HTTP gateway external dan timeout pre-flight CORS. |
| **5. Barcode Scanner Kamera** | 100% bekerja via input native `<input type="file" capture="environment">` dan browser canvas decoding. | 100% bekerja via API yang sama (atau WebRTC Stream jika HTTPS domain mandiri). |
| **6. Signature Pad (Paraf)** | Bekerja 100% via HTML5 Canvas Pointer Events & export to Base64 data URL. | Bekerja 100% via HTML5 Canvas Pointer Events & export to Base64 data URL. |
| **7. PWA Manifest** | Menggunakan Embedded Data URI Manifest (`link rel="manifest" href="data:application/manifest+json,..."`) atau file statis yang disuntikkan GAS. Mendukung install ke Home Screen Android. | Manifest file independen `/manifest.webmanifest`. Lebih fleksibel untuk kustomisasi splash screen dan icon maskable. |
| **8. Service Worker** | Memiliki batasan scope domain jika berada di dalam iframe `n-*.googleusercontent.com`. Caching offline sangat terbatas. | Kontrol penuh atas Service Worker di root domain sendiri (`/sw.js`). Cache aset statis sangat optimal. |
| **9. Risiko CORS** | **NOL (0% Risiko)**. Seluruh eksekusi skrip berada di internal domain GAS. | **TINGGI**. GAS tidak mendukung preflight `OPTIONS` secara native. Pengembang harus menangani trik `Content-Type: text/plain` atau redirect redirect 302 Google. |
| **10. Risiko Keamanan (Security)** | Tinggi keamanannya terhadap spoofing jaringan karena tidak mengekspos endpoint HTTP terbuka baru di luar GAS. | Risiko pembukaan endpoint HTTP publik baru yang rentan terhadap serangan brute-force atau scraping jika tidak dilindungi API key/WAF. |
| **11. Kompleksitas Deployment** | **Sangat Sederhana**: Cukup menggantikan file `Index.html` di dalam project Google Apps Script yang sama. Sekali deploy `Web App`, langsung aktif. | **Kompleks**: Memerlukan 2 platform (Frontend hosting di Vercel/Cloud Run + Backend di GAS) dan pipeline CI/CD ganda. |
| **12. Dampak terhadap `WebMD.html`** | **NOL (100% Aman)**. Routing `doGet(e)` di `Code.gs` tetap memisahkan `page=md` untuk `WebMD.html` dan `page=mobile` untuk `Index.html`. | Berpotensi mengganggu jika backend GAS dirombak untuk mendukung `doPost` global. |

---

## 3. Analisis Kritis Pelanggaran Aturan pada Option B

Jika **Option B** dipilih pada tahap ini, terdapat benturan langsung dengan batasan mutlak yang diberikan:
1. **Aturan "JANGAN MENGUBAH BACKEND"**: Backend saat ini (`Code.gs`) **TIDAK MEMILIKI** fungsi `doPost(e)`. Option B mewajibkan pembuatan fungsi `doPost(e)` di `Code.gs` untuk memproses request REST JSON dari luar.
2. **Aturan "JANGAN MEMBUAT API BRIDGE PADA TAHAP INI"**: Pengguna secara eksplisit menginstruksikan: *"JANGAN mengimplementasikan API bridge sebelum kontraknya jelas"*.
3. **Penanganan Redirect 302 GAS**: Setiap request `POST` ke GAS Web App akan dialihkan oleh server Google ke `https://script.googleusercontent.com/echo?user_content_key=...`. Browser modern sering kali membatalkan request ini jika header CORS tidak dikonfigurasi dengan trik khusus `Content-Type: text/plain`.

Sebaliknya, pada **Option A**:
1. Frontend baru disajikan langsung sebagai pengganti `Index.html`.
2. Backend `Code.gs`, `ServiceMD.gs`, `ServiceMaster.gs`, dan `WebMD.html` **100% TIDAK PERLU DIUBAH SAMA SEKALI**.
3. Komunikasi data menggunakan `google.script.run` yang sudah stabil dan berjalan di produksi saat ini.
4. Tampilan dan arsitektur UI mobile dibangun ulang secara total menjadi modern, responsive, mobile-first, card-based, dan mendukung instalasi PWA ke layar utama smartphone.
