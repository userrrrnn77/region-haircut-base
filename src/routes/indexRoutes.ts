// src/routes/indexRoutes.ts

import { Router } from "express";

// routes
import authRoutes from "./authRoutes";
import userRoutes from "./userRoutes";
import absensiRoutes from "./absensiRoutes";
import branchRoutes from "./brancRoutes";
import laporanRoutes from "./laporanRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/absen", absensiRoutes);
router.use("/branch", branchRoutes);
router.use("/laporan", laporanRoutes);

export default router;
