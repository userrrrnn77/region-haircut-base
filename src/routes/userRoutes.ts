// src/routes/userRoutes.ts

import { Router } from "express";
import {
  createUser,
  getAllUser,
  getUserById,
  deleteUserById,
  updateUserAssignment,
  getDashboardLaporanHarian,
} from "../controllers/userContoller.ts";
import {
  authMiddleware,
  ownerMiddleware,
} from "../middleware/authMiddleware.ts";

const router = Router();

// Semua route di sini WAJIB Login
router.use(authMiddleware);

/**
 * @route   GET /api/users/dashboard
 * @desc    Dashboard rekap cepat (Owner liat semua, Karyawan liat jatah hari ini)
 * @access  Private (All Roles)
 */
router.get("/dashboard", getDashboardLaporanHarian);

/**
 * @route   GET /api/users/:id
 * @desc    Ambil detail user tertentu
 * @access  Private (All Roles)
 */
router.get("/detail/:id", getUserById);

// ==========================================
// KHUSUS KASTA OWNER (ADMINISTRASI USER)
// ==========================================
router.use(ownerMiddleware(["owner"]));

/**
 * @route   POST /api/users
 * @desc    Owner bikin karyawan baru
 */
router.post("/", createUser);

/**
 * @route   GET /api/users
 * @desc    Owner tarik semua data user
 */
router.get("/", getAllUser);

/**
 * @route   PATCH /api/users/:id/assignment
 * @desc    Ganti role atau pindah cabang lokasi kerja
 */
router.patch("/:id/assignment", updateUserAssignment);

/**
 * @route   DELETE /api/users/:id
 * @desc    Pecat karyawan (Hapus dari DB)
 */
router.delete("/:id", deleteUserById);

export default router;
