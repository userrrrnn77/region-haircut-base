// src/routes/absensiRoutes.ts

import { Router } from "express";
import { uploadAbsen } from "../middleware/uploadMiddleware.ts";
import {
  checkIn,
  checkOut,
  absenSakit,
  getAllAbsensi,
  getMyAbsensi,
} from "../controllers/absensiController.ts";

import { chekinValidator } from "../middleware/roleMiddleware.ts";
import {
  absensiLimiter,
  authMiddleware,
  ownerMiddleware,
} from "../middleware/authMiddleware.ts";

const router = Router();

router.get(
  "/all-absensi",
  authMiddleware,
  ownerMiddleware(["owner"]),
  getAllAbsensi,
);

router.get("/my-absensi", authMiddleware, getMyAbsensi);

router.post(
  "/check-in",
  absensiLimiter,
  authMiddleware,
  uploadAbsen,
  chekinValidator,
  checkIn,
);

router.post("/check-out", authMiddleware, uploadAbsen, checkOut);

router.post("/sakit", authMiddleware, uploadAbsen, absenSakit);

export default router;
