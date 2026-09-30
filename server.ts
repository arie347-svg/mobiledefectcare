import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { SpreadsheetDatabase, SPREADSHEET_ID } from "./src/server/spreadsheetDb";

const GAS_WEBAPP_URL =
  process.env.GAS_WEBAPP_URL ||
  process.env.VITE_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyPMN2vvUNysv-Tn_2YCfzNcBLHC8FluGF0BwdHt07YrKT4lHMxQqkKjYsPd2DJ2v9ekQ/exec";

// Helper for invoking Google Apps Script endpoints safely with timeout
async function callGasRemote(url: string, action: string, data: any): Promise<any> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const gasResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ action, data }),
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseText = await gasResponse.text();
    if (
      !responseText.includes("<!DOCTYPE") &&
      !responseText.includes("<!doctype") &&
      !responseText.includes("<html")
    ) {
      let json = JSON.parse(responseText);
      if (typeof json === "string") {
        try {
          json = JSON.parse(json);
        } catch (_) {}
      }
      return json;
    }
  } catch (err: any) {
    console.log(`[API /api/gas] Remote GAS call for ${action} (${err?.message || 'offline'})`);
  }
  return null;
}

// Local execution helper matching GAS Spreadsheet backend
function executeLocalSpreadsheetAction(action: string, data: any) {
  switch (action) {
    case "lookupKodeAhm":
      return SpreadsheetDatabase.lookupKodeAhm(data?.kodeAhm || "");
    case "registerUser":
      return SpreadsheetDatabase.registerUser(data?.formData || data || {});
    case "loginUser":
      return SpreadsheetDatabase.loginUser(data?.email || "", data?.kodeAhm || "");
    case "getMasterDataKlaim":
      return SpreadsheetDatabase.getMasterDataKlaim();
    case "getRecentClaims":
      return SpreadsheetDatabase.getRecentClaims(data?.kodeAhm || "");
    case "getDashboardStats":
      return SpreadsheetDatabase.getDashboardStats(data?.kodeAhm || "");
    case "simpanPengajuanKlaim":
      return SpreadsheetDatabase.simpanPengajuanKlaim(data?.payload || data || {});
    case "dealerKonfirmasiSelesai":
      return SpreadsheetDatabase.dealerKonfirmasiSelesai(data?.idKlaim || "");
    case "dealerKonfirmasiRetur":
      return SpreadsheetDatabase.dealerKonfirmasiRetur(data?.idKlaim || "", data?.alasan || "");
    case "hapusKlaim":
      return SpreadsheetDatabase.hapusKlaim(data?.idKlaim || "", data?.noSj || "", data?.kodeAhm || "");
    case "checkDataVersion":
      return SpreadsheetDatabase.checkDataVersion(data?.clientVersion || "");
    default:
      return { success: false, message: `Action '${action}' tidak dikenali.` };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON payloads (such as claim photos in base64)
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // API Proxy / Database Handler (Matches Spreadsheet ID 1Xy9095taEr4EQC7dWqOj_nPjaIDNsxyf6k6eN7Tb3Mc)
  app.post("/api/gas", async (req, res) => {
    const { action, data } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, message: "Parameter 'action' diperlukan." });
    }

    console.log(`[API /api/gas] Eksekusi action: ${action}`);

    const canAttemptRemote = Boolean(GAS_WEBAPP_URL && GAS_WEBAPP_URL.trim().length > 0);

    // Fast-Local First Optimization: Untuk lookupKodeAhm, cek database lokal terlebih dahulu (Response < 10ms)
    if (action === "lookupKodeAhm") {
      const targetKode =
        typeof data === "string"
          ? data
          : data?.kodeAhm || data?.code || data?.kode || "";

      const localResult = SpreadsheetDatabase.lookupKodeAhm(targetKode);
      if (localResult && localResult.found) {
        console.log(`[API /api/gas] lookupKodeAhm: Cocok instan pada basis data lokal (${localResult.namaDealer})`);
        return res.json(localResult);
      }
    }

    // Fast-Local SWR Optimization: Untuk getMasterDataKlaim, jika basis data lokal sudah memiliki masterMotor,
    // kembalikan seketika (<10ms) ke client dan perbarui dari Google Spreadsheet di latar belakang (non-blocking)
    if (action === "getMasterDataKlaim" && !data?.forceRefresh) {
      const localMaster = SpreadsheetDatabase.getMasterDataKlaim();
      if (localMaster && Array.isArray(localMaster.motorList) && localMaster.motorList.length > 0) {
        console.log(`[API /api/gas] getMasterDataKlaim: Instant SWR Hit (<10ms, Motor: ${localMaster.motorList.length})`);
        if (canAttemptRemote) {
          callGasRemote(GAS_WEBAPP_URL, "getMasterDataKlaim", { forceRefresh: false })
            .then((bgRes) => {
              if (bgRes && bgRes.success && Array.isArray(bgRes.motorList) && bgRes.motorList.length > 0) {
                SpreadsheetDatabase.saveMasterData(bgRes);
              }
            })
            .catch(() => {});
        }
        return res.json(localMaster);
      }
    }

    // Dual-Write / Optimistic Local Registration Optimization:
    // Karena Kode AHM sudah diverifikasi, langsung daftarkan akun ke lokal seketika (<10ms).
    // Sinkronisasi penulisan baris ke Google Spreadsheet (Users_Mobile) dilanjutkan di background non-blocking.
    if (action === "registerUser") {
      const payloadData = data?.formData || data || {};
      const cleanEmail = (payloadData.email || "").trim().toLowerCase();
      const cleanKode = (payloadData.kodeAhm || "").trim();

      console.log(`[API /api/gas] registerUser: Optimistic Dual-Write untuk ${cleanEmail}`);

      // 1. Simpan seketika ke database lokal
      const localResult = SpreadsheetDatabase.registerUser(payloadData);
      const userObj = {
        email: cleanEmail,
        nama: (payloadData.namaLengkap || payloadData.nama || "").toUpperCase(),
        noHp: payloadData.noHp || "",
        kodeAhm: cleanKode,
        namaDealer: payloadData.namaDealer || "",
        kodeDealer: payloadData.kodeDealer || "",
        kategori: payloadData.kategori || "",
        kota: payloadData.kota || "",
        sentraDistribusi: payloadData.sentraDistribusi || "",
        role: payloadData.role || "PDI Man",
      };

      // 2. Jalankan remote append ke Google Spreadsheet di background (Non-blocking)
      if (canAttemptRemote) {
        (async () => {
          try {
            console.log(`[API /api/gas background] Mengirim append akun ke Google Apps Script: ${cleanEmail}`);
            const bgController = new AbortController();
            const bgTimeout = setTimeout(() => bgController.abort(), 35000);
            await fetch(GAS_WEBAPP_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: "registerUser", data: payloadData }),
              redirect: "follow",
              signal: bgController.signal,
            });
            clearTimeout(bgTimeout);
            console.log(`[API /api/gas background] Berhasil sinkronisasi pendaftaran akun ke remote GAS.`);
          } catch (bgErr: any) {
            console.warn(`[API /api/gas background] Notice background GAS sync (${cleanEmail}):`, bgErr?.message || bgErr);
          }
        })();
      }

      // 3. Langsung kembalikan respons sukses ke client dalam <10ms
      return res.json({
        success: true,
        message: "Akun berhasil diverifikasi & terdaftar seketika.",
        user: userObj,
      });
    }

    // PROTEKSI SERVER: Jika simpanPengajuanKlaim berstatus Draft, JANGAN teruskan ke Google Spreadsheet (Draft 100% Local-Only)
    if (action === "simpanPengajuanKlaim") {
      const targetPayload = data?.payload || data || {};
      if (String(targetPayload?.status || "").trim().toLowerCase() === "draft") {
        return res.json({
          success: true,
          idKlaim: targetPayload?.localDraftId || targetPayload?.idKlaim || `DRAFT-${Date.now()}`,
          status: "Draft",
          message: "Draft disimpan secara lokal di perangkat (tidak dikirim ke Spreadsheet).",
        });
      }
    }

    // Fast-Local First Optimization untuk loginUser (Mencegah double HTTP POST ke GAS)
    if (action === "loginUser") {
      const cleanEmail = (data?.email || "").trim().toLowerCase();
      const cleanKode = (data?.kodeAhm || "").trim();

      const digits = cleanKode.replace(/\D/g, '');
      const variants: string[] = [];
      if (digits) {
        if (digits.length <= 5) {
          variants.push(digits.padStart(5, '0'));
        }
        if (!variants.includes(cleanKode)) {
          variants.push(cleanKode);
        }
        const noZero = digits.replace(/^0+/, '');
        if (noZero && !variants.includes(noZero)) {
          variants.push(noZero);
        }
      } else if (cleanKode) {
        variants.push(cleanKode);
      }

      // 1. Cek database lokal terlebih dahulu (0ms latency)
      const finalAuthResult = SpreadsheetDatabase.loginUser(cleanEmail, cleanKode);
      if (finalAuthResult && finalAuthResult.status === "SUCCESS") {
        console.log(`[API /api/gas] loginUser sukses ditemukan di database lokal secara instan.`);
        return res.json(finalAuthResult);
      }

      // 2. Jika tidak ditemukan di lokal, panggil remote GAS tepat 1 kali
      if (canAttemptRemote) {
        const primaryVariant = variants[0] || cleanKode;
        const remoteRes = await callGasRemote(GAS_WEBAPP_URL, "loginUser", {
          email: cleanEmail,
          kodeAhm: primaryVariant,
        });

        if (remoteRes && remoteRes.status === "SUCCESS" && remoteRes.user) {
          try {
            SpreadsheetDatabase.registerUser({
              email: remoteRes.user.email,
              namaLengkap: remoteRes.user.nama || remoteRes.user.namaLengkap || "",
              noHp: remoteRes.user.noHp || "",
              kodeAhm: remoteRes.user.kodeAhm || "",
              namaDealer: remoteRes.user.namaDealer || "",
              kodeDealer: remoteRes.user.kodeDealer || "",
              kategori: remoteRes.user.kategori || "",
              kota: remoteRes.user.kota || "",
              sentraDistribusi: remoteRes.user.sentraDistribusi || "",
              role: remoteRes.user.role || "PDI Man",
            });
          } catch (_) {}

          console.log(`[API /api/gas] loginUser sukses dari remote GAS.`);
          return res.json(remoteRes);
        }

        return res.json(remoteRes || finalAuthResult);
      }

      return res.json(finalAuthResult);
    }

    // Try remote GAS first with sufficient timeout for Google Sheets querying (45s for master data)
    let remoteJson: any = null;
    if (canAttemptRemote) {
      try {
        const controller = new AbortController();
        const timeoutMs = action === "getMasterDataKlaim" ? 45000 : 25000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const gasResponse = await fetch(GAS_WEBAPP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify({ action, data }),
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const responseText = await gasResponse.text();
        if (
          !responseText.includes("<!DOCTYPE") &&
          !responseText.includes("<!doctype") &&
          !responseText.includes("<html")
        ) {
          try {
            remoteJson = JSON.parse(responseText);
            if (typeof remoteJson === "string") {
              try {
                remoteJson = JSON.parse(remoteJson);
              } catch (_) {}
            }
          } catch (_) {}
        }
      } catch (err: any) {
        console.log(`[API /api/gas] Remote GAS notice (${err?.message || 'offline'}). Melanjutkan dengan basis data lokal.`);
      }
    }

    // Fallback remote untuk lookupKodeAhm jika belum ditemukan di lokal
    if (action === "lookupKodeAhm") {
      const targetKode =
        typeof data === "string"
          ? data
          : data?.kodeAhm || data?.code || data?.kode || "";

      if (remoteJson && remoteJson.found) {
        SpreadsheetDatabase.upsertDealer(remoteJson);
        return res.json(remoteJson);
      }

      const localResult = SpreadsheetDatabase.lookupKodeAhm(targetKode);
      if (localResult && localResult.found) {
        return res.json(localResult);
      }

      if (remoteJson && remoteJson.found === false) {
        return res.json(remoteJson);
      }

      return res.json(localResult);
    }

    if (action === "getRecentClaims") {
      if (remoteJson && (remoteJson.success || Array.isArray(remoteJson.data))) {
        const rawRemoteList = Array.isArray(remoteJson.data) ? remoteJson.data : [];
        const remoteList = rawRemoteList.filter(
          (item: any) => String(item?.status || "").trim().toLowerCase() !== "draft"
        );
        SpreadsheetDatabase.syncRemoteClaims(data?.kodeAhm || "", remoteList);
        return res.json({
          success: true,
          data: remoteList,
        });
      }
      const localResult = SpreadsheetDatabase.getRecentClaims(data?.kodeAhm || "");
      return res.json(localResult);
    }

    if (action === "hapusKlaim") {
      const localResult = SpreadsheetDatabase.hapusKlaim(
        data?.idKlaim || "",
        data?.noSj || "",
        data?.kodeAhm || ""
      );
      if (canAttemptRemote && data?.purgePayload) {
        callGasRemote(GAS_WEBAPP_URL, "simpanPengajuanKlaim", data.purgePayload).catch(() => {});
      }
      return res.json(remoteJson?.success ? remoteJson : localResult);
    }

    if (action === "getClaimById") {
      if (remoteJson && remoteJson.success && remoteJson.data) {
        return res.json(remoteJson);
      }
      const targetId = typeof data === "string" ? data : data?.idKlaim || data?.id || "";
      const localResult = SpreadsheetDatabase.getClaimById(targetId);
      return res.json(localResult);
    }

    if (action === "getDashboardStats") {
      if (remoteJson && typeof remoteJson.draft === "number") {
        return res.json(remoteJson);
      }
      const localResult = SpreadsheetDatabase.getDashboardStats(data?.kodeAhm || "");
      return res.json(localResult);
    }

    if (action === "simpanPengajuanKlaim") {
      const localResult = SpreadsheetDatabase.simpanPengajuanKlaim(data?.payload || data || {});
      return res.json(remoteJson?.success ? remoteJson : localResult);
    }

    if (action === "dealerKonfirmasiSelesai") {
      const localResult = SpreadsheetDatabase.dealerKonfirmasiSelesai(data?.idKlaim || "");
      return res.json(remoteJson?.success ? remoteJson : localResult);
    }

    if (action === "dealerKonfirmasiRetur") {
      const localResult = SpreadsheetDatabase.dealerKonfirmasiRetur(data?.idKlaim || "", data?.alasan || "");
      return res.json(remoteJson?.success ? remoteJson : localResult);
    }

    if (action === "getMasterDataKlaim") {
      if (remoteJson && remoteJson.success) {
        try {
          SpreadsheetDatabase.saveMasterData(remoteJson);
        } catch (_) {}

        return res.json({
          success: true,
          transporterList: Array.isArray(remoteJson.transporterList) ? remoteJson.transporterList : [],
          motorList: Array.isArray(remoteJson.motorList) ? remoteJson.motorList : [],
          partList: Array.isArray(remoteJson.partList) ? remoteJson.partList : [],
          kerusakanList: Array.isArray(remoteJson.kerusakanList) ? remoteJson.kerusakanList : [],
          penyebabList: Array.isArray(remoteJson.penyebabList) ? remoteJson.penyebabList : [],
        });
      }

      const localData = SpreadsheetDatabase.getMasterDataKlaim();
      if (localData && Array.isArray(localData.motorList) && localData.motorList.length > 0) {
        console.log(`[API /api/gas] Menggunakan master data lokal (Motor: ${localData.motorList.length})`);
        return res.json(localData);
      }

      return res.json(remoteJson || {
        success: false,
        message: "Menghubungkan ke Google Spreadsheet...",
        motorList: [],
        partList: [],
        transporterList: [],
        kerusakanList: [],
        penyebabList: []
      });
    }

    // Default fallback
    const defaultResult = executeLocalSpreadsheetAction(action, data);
    return res.json(remoteJson || defaultResult);
  });

  // Health check endpoint (Tanpa mengekspos ID Spreadsheet atau URL internal)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      configured: Boolean(SPREADSHEET_ID && GAS_WEBAPP_URL),
    });
  });

  // Manifest endpoint with proper application/manifest+json MIME type
  app.get(["/manifest.webmanifest", "/manifest.json"], (_req, res) => {
    const publicManifest = path.join(process.cwd(), "public", "manifest.webmanifest");
    const rootManifest = path.join(process.cwd(), "manifest.webmanifest");
    const manifestFile = fs.existsSync(publicManifest) ? publicManifest : rootManifest;
    res.type("application/manifest+json").sendFile(manifestFile);
  });

  // Service Worker endpoint with proper MIME type and no-cache header
  app.get("/sw.js", (_req, res) => {
    const swFile = path.join(process.cwd(), "public", "sw.js");
    if (fs.existsSync(swFile)) {
      res.type("application/javascript").set("Cache-Control", "no-cache, no-store, must-revalidate").sendFile(swFile);
    } else {
      res.status(404).send("Service worker file not found");
    }
  });

  // Serve static assets from public folder explicitly
  app.use(express.static(path.join(process.cwd(), "public")));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Server] Port ${PORT} sedang digunakan. Keluar agar process supervisor dapat mengatur ulang.`);
      process.exit(1);
    } else {
      console.error("[Server] Kesalahan listener:", err);
    }
  });

  const handleShutdown = () => {
    console.log("[Server] Menutup koneksi server secara aman...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}

startServer();