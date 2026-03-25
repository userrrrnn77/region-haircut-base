// src/routes/authRoutes.ts

import { Router } from "express";
import {
  authMiddleware,
  absensiLimiter,
  loginLimiter,
  ownerMiddleware,
} from "../middleware/authMiddleware.js";
import { login, updateMe } from "../controllers/authController.js";
import { uploadAvatar } from "../middleware/uploadMiddleware.js";

const router = Router();

router.post("/login", loginLimiter, login);
router.patch("/update-me", authMiddleware, uploadAvatar, updateMe);

export default router;
