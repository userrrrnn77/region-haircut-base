// src/middleware/uploadMiddleware.ts

import multer, { type FileFilterCallback } from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import type { Request } from "express";
import path from "path";

// ===================================
// logic updload foto absen dan avatar
// ===================================

// kalo mau pake upload manual tapi ga stabil njir suka race condition

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => {
    console.log("UPLOAD PATH", req.path);
    let foldername = "general";
    const url = req.originalUrl;

    if (
      url.includes("check-in") ||
      url.includes("sakit") ||
      url.includes("check-out")
    ) {
      foldername = "absensi";
    } else if (url.includes("avatar")) {
      foldername = "avatar";
    }

    return {
      folder: `region_haircut/${foldername}`,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
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

// ini lebih stabil

const upload = multer({
  storage: storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter,
});

// upload avatar

export const uploadAvatar = upload.single("avatar");

// upload absen

export const uploadAbsen = upload.single("photo");

// ==========================================
// Delete From Cloudinary biar bandwitch Aman
// ==========================================

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};
