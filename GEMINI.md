# ATURAN & INSTRUKSI PERSISTEN GEMINI (SYSTEM PROMPT INJECTION)

Harap selalu patuhi aturan berikut untuk menjaga stabilitas fitur:

1. **Panel 3 Klaim (ClaimWizard.tsx)**:
   - **DIKIRIM LANGSUNG**: Data sopir, nopol, transporter pengembalian selalu otomatis mengambil dari Step 1. Form input disembunyikan dan diganti dengan status konfirmasi hijau.
   - **DITITIP**: 
     - Kolom Nama Sopir Titipan dan Nomor Polisi Pengembalian aktif.
     - Nomor Polisi memiliki dropdown autocomplete dari daftar master transporter.
     - Jika nopol cocok di master, transporter otomatis terpilih dan input manual transporter disembunyikan.
     - Jika nopol baru/manual, tampilkan pilihan manual transporter (`TM`, `RJTM`, `JTM`, `WSS`, `YSS`, `SBR`) yang otomatis disimpan ke referensi.
     - Mode Simpan Draft memperbolehkan data sopir/nopol kosong (Draft 24 Jam).
     - Tombol "Kirim ke MD" memvalidasi data sopir, nopol, dan paraf lengkap.
   - **Edit Draft**: Membuka draft klaim mengarahkan wizard ke Step terakhir pengisian data draft secara dinamis (Step 1, Step 2, atau Step 3).

2. **Snapshot Pemulihan**:
   - Direktori `.backup_locked_v1/` menyimpan cadangan kode stabil saat ini.
