// src/routes/laporanRoutes.ts

import { Router } from "express";
import {
  saveManualReport,
  getLaporanHarian,
  exportLaporanHarian,
} from "../controllers/laporanHarianController.js";
import {
  authMiddleware,
  ownerMiddleware,
} from "../middleware/authMiddleware.js";

const router = Router();

/**
 * @route   GET /api/laporan
 * @desc    Get data laporan (Daily/Monthly summary)
 * @access  Private (Karyawan liat punya sendiri, Owner liat semua)
 */
router.get("/", authMiddleware, getLaporanHarian);

router.get("/export", authMiddleware, exportLaporanHarian);

/**
 * @route   POST /api/laporan/setor
 * @desc    Karyawan setor cuan (Auto-link ke Branch dari Absensi)
 * @access  Private (All Roles - tapi logic di controller nge-lock via Absensi)
 */
router.post("/setor", authMiddleware, saveManualReport);

/**
 * @route   DELETE /api/laporan/:id
 * @desc    Contoh kalo Owner mau hapus laporan salah (Opsional)
 */
// router.delete("/:id", authMiddleware, ownerMiddleware(["owner"]), deleteLaporan);

export default router;
