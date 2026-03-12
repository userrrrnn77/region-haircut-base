// src/middleware/authMiddlewares.ts

import type { Request, Response, NextFunction } from "express";
import type { UserDocument } from "../models/User";

export interface AuthRequest extends Request {
  user?: UserDocument;
  validatedLocation?: {
    lat: number;
    lng: number;
  };
}

/**
 * Middleware untuk ngecek role user
 * @param allowedRoles array role yang boleh akses, contoh ['admin', 'staff']
 */
export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Data user tidak ditemukan" });
    }

    const userRole = req.user.role?.toLowerCase();

    if (
      !userRole ||
      !allowedRoles.some((role) => role.toLowerCase() === userRole)
    ) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak: Role "${req.user.role}" tidak memiliki izin`,
      });
    }

    next();
  };
};

/**
 * Middleware untuk validasi koordinat checkin
 */
export const chekinValidator = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const { lat, lng } = req.body;

  // cek undefined dulu (0 itu valid)
  if (lat === undefined || lng === undefined) {
    res
      .status(400)
      .json({ success: false, message: "Koordinat GPS wajib diisi" });
    return;
  }

  // cek tipe string/number, pastikan cuma angka valid
  const latitude = parseFloat(lat as any);
  const longitude = parseFloat(lng as any);

  if (
    isNaN(latitude) ||
    isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    res.status(400).json({
      success: false,
      message: "Koordinat tidak valid atau dimanipulasi",
    });
    return;
  }

  // optional: batasi wilayah Indonesia
  // const isInIndonesia = latitude >= -11 && latitude <= 6 && longitude >= 95 && longitude <= 141;
  // if (!isInIndonesia) return res.status(400).json({ success: false, message: "Koordinat di luar jangkauan" });

  req.validatedLocation = { lat: latitude, lng: longitude };
  next();
};
