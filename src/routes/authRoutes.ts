// src/routes/authRoutes.ts

import { Router } from "express";
import {
  authMiddleware,
  absensiLimiter,
  loginLimiter,
  ownerMiddleware,
} from "../middleware/authMiddleware.ts";
import { login, updateMe } from "../controllers/authController.ts";
import { uploadAvatar } from "../middleware/uploadMiddleware.ts";

const router = Router();

router.post("/login", loginLimiter, login);
router.patch("/update-me", authMiddleware, uploadAvatar, updateMe);

export default router;
