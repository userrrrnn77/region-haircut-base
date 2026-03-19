// src/routes/authRoutes.ts

import { Router } from "express";
import {
  authMiddleware,
  absensiLimiter,
  loginLimiter,
  ownerMiddleware,
} from "../middleware/authMiddleware";
import { login, updateMe } from "../controllers/authController";
import { uploadAvatar } from "../middleware/uploadMiddleware";

const router = Router();

router.post("/login", loginLimiter, login);
router.patch("/update-me", authMiddleware, uploadAvatar, updateMe);

export default router;
