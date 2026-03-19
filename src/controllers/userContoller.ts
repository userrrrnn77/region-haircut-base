// src/controllers/userContoller.ts

import type { Request, Response, NextFunction } from "express";
import UserModel, { type UserDocument } from "../models/User";
import BranchModel, { type IBranchLocations } from "../models/BranchLocations";
import AbsensiModel, { type IAbsensi } from "../models/Absensi";
import LaporanHarianModel, {
  type ILaporanHarian,
} from "../models/LaporanHarian";
import { Types } from "mongoose";
import { getNowJakarta } from "./absensiController";

interface AuthRequest extends Request {
  user?: UserDocument;
  file?: Express.Multer.File;
}

// Buat User Baru

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const {
      username,
      fullname,
      email,
      password,
      avatar,
      role,
      branchLocations,
    } = req.body;

    if (!username || !fullname || !email || !password || !branchLocations) {
      return res.status(400).json({
        success: false,
        message: "Data tidak lengkap njir, yang bener aja",
      });
    }

    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email Sudah Terdaftar Bre ANJG" });
    }

    const userRole = role || "karyawan";
    const isBoss = userRole === "owner";

    let locationIds: Types.ObjectId[] = [];

    if (!isBoss) {
      const locationInput = Array.isArray(branchLocations)
        ? branchLocations
        : [branchLocations];
      const cleanCodes = locationInput
        .filter((b) => b)
        .map((b) => b.trim().toUpperCase().replace(/\s+/g, "_"));

      const workLocDocs = await BranchModel.find({
        code: { $in: cleanCodes },
        role: userRole,
      });

      if (workLocDocs.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Gagal Bre Gada lokasi buat divisi ${userRole}`,
        });
      }

      locationIds = workLocDocs.map((loc) => loc._id);
    }

    const user = new UserModel({
      username: username.toLowerCase().trim(),
      fullname,
      email,
      password,
      role: userRole,
      branchLocations: locationIds,
    });

    await user.save();

    const userResponse = user.toObject();
    delete (userResponse as Partial<UserDocument>).password;

    return res.status(201).json({
      success: true,
      message: "Berhasil Bikin User Baru bre Mantap",
      data: userResponse,
    });
  } catch (error: any) {
    console.log(error.message, "Error Bre Dari Console");
    return res.status(500).json({
      success: false,
      message: "gagal bre mampus",
      error: error.message,
    });
  }
};

// Ambil Semua Data User

export const getAllUser = async (req: AuthRequest, res: Response) => {
  try {
    const users = await UserModel.find()
      .populate("branchLocations", "name code role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Berhasil Narik Data semua User bre",
      data: users,
    });
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal Narik data bre mampus",
      error: error.message,
    });
  }
};

// Abil User Dari Id Atau Detail User

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id)
      .populate("branchLocations", "name code role radiusMeter center")
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Gada Bre gahib dia kalo beneran ada",
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Nah Datanya bre ANJG", data: user });
  } catch (error: any) {
    console.log(error.message, "Error dari console bre");
    return res
      .status(500)
      .json({ success: false, message: "Gagal Bre Mampus Ghaib nih keknya" });
  }
};

// ambil laporan harian

export const getDashboardLaporanHarian = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Login Dulu NJir Peak Bisa aja Token Elu abis Harus Login Ulang Goblok",
      });
    }

    const { _id: id, role } = req.user;

    const nowJakarta = getNowJakarta();
    const todayKey = nowJakarta.format("YYYY-MM-DD");

    // Logika Owner
    if (role === "owner") {
      const targetDate = nowJakarta.toDate();
      targetDate.setHours(0, 0, 0, 0);

      const [totalUsers, absensiMasuk, statsGlobal] = await Promise.all([
        UserModel.countDocuments({ role: { $ne: "owner" } }),
        AbsensiModel.countDocuments({
          absensiDayKey: todayKey,
          type: "masuk",
        }),
        // AGGREGATE SAKTI: Itung Omzet, Share, dan Jajan sekaligus
        LaporanHarianModel.aggregate([
          { $match: { reportDate: targetDate } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalRevenue" },
              totalOwner: { $sum: "$ownerShare" },
              totalEmployee: { $sum: "$employeeShare" },
              totalManagement: { $sum: "$managementShare" },
              // ITUNG SEMUA JAJANAN HARI INI
              totalJajan: { $sum: { $sum: "$managementExpenses.amount" } },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const s = statsGlobal[0] || {
        totalRevenue: 0,
        totalOwner: 0,
        totalEmployee: 0,
        totalManagement: 0,
        totalJajan: 0,
        count: 0,
      };

      const yangKagakMasuk = totalUsers - absensiMasuk;

      return res.status(200).json({
        success: true,
        message: "Berhasil Narik data bre",
        data: {
          totalKaryawan: totalUsers,
          absensiMasuk,
          totalLaporan: s.count,
          yangKagakMasuk: yangKagakMasuk < 0 ? 0 : yangKagakMasuk,
        },
        summary: {
          totalRevenue: s.totalRevenue,
          totalOwner: s.totalOwner,
          totalEmployee: s.totalEmployee,
          // INI DIA: Management Bruto dikurangin Jajan
          totalManagement: s.totalManagement,
          managementNet: s.totalManagement - s.totalJajan,
          totalExpenses: s.totalJajan,
          // DUIT FISIK YANG WAJIB ADA DI TANGAN
          totalCashToDeposit: s.totalRevenue - s.totalJajan,
        },
      });
    }

    // LOGIKA KARYAWAN langsung gini bre harusnya ya?

    const userObjectId = new Types.ObjectId(id);

    const startOfToday = nowJakarta.startOf("day").toDate();

    const startOfMonth = nowJakarta.startOf("month").toDate();

    const [dataAbsensi, statsLaporan, statsBulanan] = await Promise.all([
      // GINI CARA NYARINYA BIAR KAGA "MABAL" PAS LEWAT JAM 12 MALEM
      AbsensiModel.findOne({
        user: userObjectId,
        $or: [
          { absensiDayKey: todayKey }, // Cari yang hari ini (15)
          { isIncomplete: true }, // ATAU cari yang belum checkout biarpun dari kemarin (14)
        ],
      }).sort({ createdAt: -1 }), // Ambil yang paling baru biar kaga salah data

      LaporanHarianModel.aggregate([
        { $match: { createdBy: userObjectId, reportDate: startOfToday } },
        {
          $group: {
            _id: null,
            totalKepala: { $sum: 1 },
            gajiHariIni: { $sum: "$employeeShare" },
          },
        },
      ]),
      LaporanHarianModel.aggregate([
        {
          $match: {
            createdBy: userObjectId,
            reportDate: { $gte: startOfMonth }, // Ambil semua yang >= awal bulan
          },
        },
        {
          $group: {
            _id: null,
            totalKepalaSebulan: { $sum: 1 },
            gajiSebulan: { $sum: "$employeeShare" },
          },
        },
      ]),
    ]);

    const hasilKerja = statsLaporan[0] || { totalKepala: 0, gajiHariIni: 0 };
    const hasilBulanan = statsBulanan[0] || {
      totalKepalaSebulan: 0,
      gajiSebulan: 0,
    };

    const statusAbsen = dataAbsensi
      ? dataAbsensi.type
      : "Belum Absen, Mabal Lu?!";

    return res.status(200).json({
      success: true,
      message: "Nah ini jatah lu hari ini, bre!",
      data: {
        statusAbsen: statusAbsen,
        checkinTime: dataAbsensi ? (dataAbsensi as IAbsensi).createdAt : null, // ini bre
        totalKepala: hasilKerja.totalKepala,
        gajiEstimasi: hasilKerja.gajiHariIni,
        totalGajiBulanIni: hasilBulanan.gajiSebulan,
        today: todayKey,
      },
    });
  } catch (error: any) {
    console.log(error.message, "Error Dari Console bre");
    return res.status(500).json({
      success: false,
      message: "Error bre Mampus",
      error: error.message,
    });
  }
};

// Delete User bre

export const deleteUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findByIdAndDelete(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User Tidak Ketemu Bre Sorry Ye" });

    return res.status(200).json({
      success: true,
      message: `User ${user.fullname} Berhasil di Hapus`,
      data: user,
    });
  } catch (error: any) {
    console.log(error.message, "Error Dari Console Bre");
    return res.status(500).json({
      success: false,
      message: "Gagal hapus User bre",
      error: error.message,
    });
  }
};

// update User Assignment

export const updateUserAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role, branchLocations, password } = req.body;

    const user = await UserModel.findById(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User Tidak Ketemu mbot" });

    const openSession = await AbsensiModel.findOne({
      user: id,
      isIncomplete: true,
    });

    if (openSession && (role || branchLocations))
      return res.status(400).json({
        success: false,
        message:
          "Si user lagi kerja! Suruh checkout dulu baru bisa ganti role/lokasi!",
      });

    if (role) user.role = role;
    if (password && password.trim() === "") user.password = password;

    if (branchLocations) {
      const locationInput = Array.isArray(branchLocations)
        ? branchLocations
        : [branchLocations];
      const cleanCodes = locationInput
        .filter((b) => b)
        .map((b) => b.trim().toUpperCase().replace(/\s+/g, "_"));

      const workLocDocs = await BranchModel.find({
        code: { $in: cleanCodes },
        role: user.role,
        isActive: true,
      });

      if (user.role !== "owner" && workLocDocs.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Gagal! Lokasi kaga cocok/aktif buat role ${user.role}`,
        });
      }

      user.branchLocations = workLocDocs.map(
        (loc: IBranchLocations) => loc._id as any,
      );
    }

    await user.save();

    const updateUser = await UserModel.findById(id)
      .populate("branchLocations", "name code role")
      .select("-password");

    return res.status(200).json({
      success: true,
      message: "Berhasil Update User bre",
      data: updateUser,
    });
  } catch (error: any) {
    console.log(error.message, "Error Dari Console Bre");
    return res.status(500).json({
      success: false,
      message: "Gagal Update User Bre MAMPUS",
      error: error.message,
    });
  }
};
