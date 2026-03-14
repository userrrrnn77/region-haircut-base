// src/controllers/userContoller.ts

import type { Request, Response, NextFunction } from "express";
import UserModel, { type UserDocument } from "../models/User.ts";
import BranchModel, {
  type IBranchLocations,
} from "../models/BranchLocations.ts";
import AbsensiModel, { type IAbsensi } from "../models/Absensi.ts";
import LaporanHarianModel, {
  type ILaporanHarian,
} from "../models/LaporanHarian.ts";
import { Types } from "mongoose";
import { getNowJakarta } from "./absensiController.ts";

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

      const [totalUsers, absensiMasuk, totalLaporan, laporanPerUser] =
        await Promise.all([
          UserModel.countDocuments({ role: { $ne: "owner" } }),
          AbsensiModel.countDocuments({
            absensiDayKey: todayKey,
            type: "masuk",
          }),
          // FIX: Pake reportDate & targetDate
          LaporanHarianModel.countDocuments({ reportDate: targetDate }),

          LaporanHarianModel.aggregate([
            // FIX: Match pake reportDate (Date Object)
            { $match: { reportDate: targetDate } },
            {
              $group: {
                // FIX: Pake createdBy (bukan userId)
                _id: "$createdBy",
                totalPotong: { $sum: 1 },
                // FIX: Pake ownerShare (bukan shareOwner)
                totalSetoran: { $sum: "$ownerShare" },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "userDetails",
              },
            },
            { $unwind: "$userDetails" },
            {
              $project: {
                _id: 1,
                totalPotong: 1,
                totalSetoran: 1,
                namaKaryawan: "$userDetails.fullname",
              },
            },
          ]),
        ]);

      const yangKagakMasuk = totalUsers - absensiMasuk;

      const totalRevenue = laporanPerUser.reduce(
        (a, b) => a + b.totalSetoran,
        0,
      );

      return res.status(200).json({
        success: true,
        message: "Berhasil Narik data bre",
        data: {
          totalKaryawan: totalUsers,
          absensiMasuk,
          totalLaporan,
          laporanPerUser,
          yangKagakMasuk: yangKagakMasuk < 0 ? 0 : yangKagakMasuk,
        },
        summary: {
          // Lu itung semua jatah di sini bre biar FE tinggal mangap
          totalRevenue: Math.round(totalRevenue / 0.5), // Balikin ke 100% (karena totalSetoran itu 50% jatah owner)
          totalOwner: Math.round(totalRevenue), // 50%
          totalEmployee: Math.round((totalRevenue / 0.5) * 0.4), // 40%
          totalManagement: Math.round((totalRevenue / 0.5) * 0.1), // 10% ini dia yang lu cari!
        },
      });
    }

    // LOGIKA KARYAWAN langsung gini bre harusnya ya?

    const userObjectId = new Types.ObjectId(id);

    const targetDate = nowJakarta.toDate();
    targetDate.setHours(0, 0, 0, 0);

    const [dataAbsensi, statsLaporan] = await Promise.all([
      // GINI CARA NYARINYA BIAR KAGA "MABAL" PAS LEWAT JAM 12 MALEM
      AbsensiModel.findOne({
        user: userObjectId,
        $or: [
          { absensiDayKey: todayKey }, // Cari yang hari ini (15)
          { isIncomplete: true }, // ATAU cari yang belum checkout biarpun dari kemarin (14)
        ],
      }).sort({ createdAt: -1 }), // Ambil yang paling baru biar kaga salah data

      LaporanHarianModel.aggregate([
        { $match: { createdBy: userObjectId, reportDate: targetDate } },
        {
          $group: {
            _id: null,
            totalKepala: { $sum: 1 },
            gajiHariIni: { $sum: "$employeeShare" },
          },
        },
      ]),
    ]);

    const hasilKerja = statsLaporan[0] || { totalKepala: 0, gajiHariIni: 0 };
    const statusAbsen = dataAbsensi
      ? dataAbsensi.type
      : "Belum Absen, Mabal Lu?!";

    return res.status(200).json({
      success: true,
      message: "Nah ini jatah lu hari ini, bre!",
      data: {
        statusAbsen: statusAbsen,
        totalKepala: hasilKerja.totalKepala,
        gajiEstimasi: hasilKerja.gajiHariIni,
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
