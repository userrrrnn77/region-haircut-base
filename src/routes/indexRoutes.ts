// src/routes/indexRoutes.ts

import { Router } from "express";

// routes
import authRoutes from "./authRoutes.ts";
import userRoutes from "./userRoutes.ts";
import absensiRoutes from "./absensiRoutes.ts";
import branchRoutes from "./brancRoutes.ts";
import laporanRoutes from "./laporanRoutes.ts";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/absen", absensiRoutes);
router.use("/branch", branchRoutes);
router.use("/laporan", laporanRoutes);

export default router;
