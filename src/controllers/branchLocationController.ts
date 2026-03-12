// src/controllers/branchLocationController.ts

import type { Request, Response } from "express";
import { Types } from "mongoose";
import BranchModel from "../models/BranchLocations.ts";
import UserModel, { type UserDocument } from "../models/User.ts";
import AbsensiModel from "../models/Absensi.ts";

interface AuthRequest extends Request {
  user?: UserDocument
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
    const { role, lat, lng, ...updateData } = req.body;

    if (!id || Array.isArray(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Id tidak valid bre" });
    }

    const branchId = new Types.ObjectId(id);

    if (role) {
      const isUsed = await UserModel.exists({
        branchLocations: { $elemMatch: branchId },
      });

      if (isUsed) {
        return res
          .status(400)
          .json({ success: false, message: "Lokasi Sudah di pakai bre" });
      }
    }

    const updateBranch = await BranchModel.findByIdAndUpdate(
      branchId,
      {
        ...updateData,
        ...(lat &&
          lng && {
            center: {
              lat: parseFloat(lat),
              lng: parseFloat(lng),
            },
          }),
      },
      {
        new: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Update berhasil bre Mantap",
      data: updateBranch,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Update Bre mampus" });
  }
};

// Delete Branches

export const deleteBranches = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || Array.isArray(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Id tidak valid bre" });
    }

    const branchId = new Types.ObjectId(id);

    const hasHistory = await AbsensiModel.exists({
      branchLocation: { $elemMatch: branchId },
    });

    if (hasHistory) {
      await BranchModel.findByIdAndUpdate(branchId, { isActive: false });
      return res
        .status(200)
        .json({ success: true, message: "Berhasil di nonaktifkan bre" });
    }

    const locDelete = await BranchModel.findByIdAndDelete(branchId);
    if (!locDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Gagal Bre Lokasi Udah gada njir" });
    }

    await UserModel.updateMany(
      { branchLocations: { $elemMatch: { $eq: branchId } } },
      { $pull: { branchLocations: { $in: [branchId] } } },
    );

    return res.status(200).json({
      success: true,
      message: "Sukses Hapus Lokasi Secara Permanen bre",
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Hapus Lokasi bre" });
  }
};
