// src/routes/indexRoutes.ts

import { Router } from "express";

// routes
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import absensiRoutes from "./absensiRoutes.js";
import branchRoutes from "./brancRoutes.js";
import laporanRoutes from "./laporanRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/absen", absensiRoutes);
router.use("/branch", branchRoutes);
router.use("/laporan", laporanRoutes);

export default router;
