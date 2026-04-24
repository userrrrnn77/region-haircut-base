// src/middleware/authMiddleware.ts

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel, { type UserDocument } from "../models/User.js";
import { rateLimit } from "express-rate-limit";

const rateLimitFn: any = rateLimit;

interface JwtPayload {
  id: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: UserDocument;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ success: false, message: "Token Otorisasi Diperlukan" });
      return;
    }

    const token = authHeader.split(" ")[1] as string;
    const secret = process.env.JWT_SECRET as string;

    if (!secret) {
      throw new Error("JWT_SECRET is not defined in env mbot!!!");
    }

    const decode = jwt.verify(token, secret) as unknown as JwtPayload;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Akses Ditolak Token tidak ketemu mbot",
      });
      return;
    }

    const user = await UserModel.findById(decode.id).select("-password");

    if (!user) {
      res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan Mbot!!!" });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Token Kadaluarsa"
          : "Token TIdak Valid",
    });
  }
};

export const ownerMiddleware = (allowedRole: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRole.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses MBOT (Forbidden)",
      });
    }
    next();
  };
};

export const loginLimiter = rateLimitFn({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Terlalu Banyak Percobaan login, Coba lagi 15 menit kemudian MBOT",
  },
  standardHeaders: true,
  legacyHeaders: true,
  validate: { xForwardedForHeader: false },
});

export const absensiLimiter = rateLimitFn({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Terlalu Banyak req lu anjg Tunggu bentar sat",
  },
  validate: { xForwardedForHeader: false },
});
