// src/middleware/uploadMiddleware.ts

import multer, { type FileFilterCallback } from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.ts";
import type { Request } from "express";
import path from "path";

// ===================================
// logic updload foto absen dan avatar
// ===================================

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => {
    let foldername = "general";
    const url = req.originalUrl;

    if (url.includes("absensi")) foldername = "absensi";
    else if (url.includes("avatar")) foldername = "avatar";

    return {
      folder: `region_haircut/${foldername}`,
      allowed_format: ["jpg", "jpeg", "png", "webp"],
      public_id: `${Date.now()}-${path.parse(file.originalname).name}`,
    };
  },
});

// File FIlter

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Hanya file gambar yang di izinkan"));
  } else {
    cb(null, true);
  }
};

// upload avatar

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter,
}).single("avatar");

// upload absen

export const uploadAbsen = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter,
}).single("photo");

// ==========================================
// Delete From Cloudinary biar bandwitch Aman
// ==========================================

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};
