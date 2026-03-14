// src/controllers/branchLocationController.ts

import type { Request, Response } from "express";
import { Types } from "mongoose";
import BranchModel from "../models/BranchLocations.ts";
import UserModel, { type UserDocument } from "../models/User.ts";
import AbsensiModel from "../models/Absensi.ts";

interface AuthRequest extends Request {
  user?: UserDocument;
  file?: Express.Multer.File;
}

// Get ALl Branches

export const getAllBranchLocations = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const getLocation = await BranchModel.find().sort({ createdAt: -1 });

    if (!getLocation) {
      return res
        .status(404)
        .json({ success: false, message: "Lokasi Tidak Ketemu Di Database" });
    }

    return res.status(200).json({
      success: true,
      message: "Nah Lokasi yang lu cari bre",
      data: getLocation,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Narik Data bre" });
  }
};

// Buat Branches

export const createBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, lat, lng, radiusMeter, role } = req.body;

    if (!code || !name || !lat || !lng || !role) {
      return res
        .status(400)
        .json({ success: false, message: "Data Kurang Lengkap bre anjg" });
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, "_");

    const existing = await BranchModel.findOne({ code: cleanCode, role });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Divisi ${role}, udah punya aturan disini bre anjg`,
      });
    }

    const newLocation = await BranchModel.create({
      code: cleanCode,
      role,
      name,
      center: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      },
      radiusMeter: parseFloat(radiusMeter || 7),
    });

    return res.status(201).json({
      success: true,
      message: "Berhasil Menambahkan Lokasi Kerja baru bre",
      data: newLocation,
    });
  } catch (error: any) {
    console.log("Error Nih", error.message);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Udah Ada Lokasi ini njir" });
    }
    return res.status(500).json({
      success: false,
      message: "Error Bre, Gagal Bikin Lokasi Cek Lagi Field Inputnya",
    });
  }
};

// Update Branches

export const updateBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role, lat, lng, radiusMeter, name, code } = req.body;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID kaga valid, mbot!" });
    }

    const branchId = new Types.ObjectId(id);

    // Cek kalo mau ganti role, tapi udah dipake karyawan
    if (role) {
      const isUsed = await UserModel.exists({
        branchLocations: { $in: [branchId] } as any,
      });
      if (isUsed) {
        return res.status(400).json({
          success: false,
          message:
            "Lokasi ini lagi dipake karyawan, role-nya jangan diganti dulu asu!",
        });
      }
    }

    const updateBranch = await BranchModel.findByIdAndUpdate(
      branchId,
      {
        name,
        code,
        role,
        radiusMeter: parseFloat(radiusMeter),
        center: {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
        },
      },
      { new: true, runValidators: true },
    );

    if (!updateBranch) {
      return res
        .status(404)
        .json({ success: false, message: "Lokasi ghaib, kaga ketemu!" });
    }

    return res.status(200).json({
      success: true,
      message: "Update berhasil bre, mantap!",
      data: updateBranch,
    });
  } catch (error: any) {
    console.error("ERROR UPDATE:", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Update Bre, mampus!" });
  }
};

// Delete Branches

export const deleteBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID kaga valid bre!" });
    }

    const branchId = new Types.ObjectId(id);

    // 1. Cek di Absensi (History)
    // Di model lu: branchLocation (singular)
    const hasHistory = await AbsensiModel.exists({
      branchLocation: { $in: [branchId] } as any,
    });

    if (hasHistory) {
      // Kalo ada history, jangan hapus permanen biar data kaga corrupt
      await BranchModel.findByIdAndUpdate(branchId, { isActive: false });
      return res.status(200).json({
        success: true,
        message: "Berhasil dinonaktifkan bre (karena ada history absen)",
      });
    }

    // 2. Kalo kaga ada history, hapus permanen
    const locDelete = await BranchModel.findByIdAndDelete(branchId);
    if (!locDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Lokasi emang udah kaga ada njir" });
    }

    // 3. Cabut referensi lokasi ini dari semua User
    // Pake $pull karena branchLocations di model User adalah array
    await UserModel.updateMany(
      { branchLocations: { $in: [branchId] } as any },
      { $pull: { branchLocations: branchId } as any },
    );

    return res.status(200).json({
      success: true,
      message: "Sukses Hapus Lokasi Secara Permanen bre!",
    });
  } catch (error: any) {
    console.error("ERROR DELETE:", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Hapus Lokasi bre!" });
  }
};
