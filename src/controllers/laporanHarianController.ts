// src/controllers/laporanHarianController.ts

import type { Response } from "express";
import LaporanHarianModel from "../models/LaporanHarian.ts";
import AbsensiModel from "../models/Absensi.ts";
import { getNowJakarta, type AuthRequest } from "./absensiController.ts";
import { Types } from "mongoose";

/**
 * Controller Setor Cuan Akhir Shift
 * Otomatis deteksi Branch dari Absensi Hari Ini
 */
export const saveManualReport = async (req: AuthRequest, res: Response) => {
  try {
    const { totalRevenue, notes } = req.body;

    // 1. Validasi Input (Padat & Singkat)
    if (!totalRevenue || totalRevenue < 0) {
      return res.status(400).json({
        success: false,
        message: "Input cuan yang bener, mbot! Jangan 0 atau minus!",
      });
    }

    const nowJakarta = getNowJakarta();
    const todayKey = nowJakarta.format("YYYY-MM-DD");
    const targetDate = nowJakarta.toDate();
    targetDate.setHours(0, 0, 0, 0);

    // 2. OTOMATISASI BRANCH (Link ke GPS Absensi)
    // Nyari record absen si user hari ini buat tau dia kerja di branch mana
    const userAbsensi = await AbsensiModel.findOne({
      user: req.user?._id,
      absensiDayKey: todayKey,
      type: { $in: ["masuk", "keluar"] }, // Berlaku buat yang masih shift atau udah checkout
    });

    if (!userAbsensi || !userAbsensi.branchLocation) {
      return res.status(403).json({
        success: false,
        message:
          "Lu belum absen hari ini, mbot! Kaga bisa setor cuan kalo kaga kerja!",
      });
    }

    // 3. UPSERT LOGIC (Sesuai Compound Index: Date + Branch + User)
    // Kalo dia salah input terus input lagi, datanya otomatis ke-update (Upsert)
    const report = await LaporanHarianModel.findOneAndUpdate(
      {
        reportDate: targetDate,
        branch: userAbsensi.branchLocation,
        createdBy: req.user?._id,
      },
      {
        totalRevenue: Math.round(totalRevenue),
        notes: notes || "-",
        // Field wajib buat document baru (Upsert)
        reportDate: targetDate,
        branch: userAbsensi.branchLocation,
        createdBy: req.user?._id,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    // 4. RESPONSE (Pre-save hook otomatis ngitung 50-40-10)
    return res.status(201).json({
      success: true,
      message: "Setoran Cuan Sukses, Bre! Rektorat Bangga!",
      data: {
        tanggal: todayKey,
        omzet: report.totalRevenue,
        jatahLu: report.employeeShare, // Info gaji 40% langsung muncul
        branch: userAbsensi.locationSnapShot?.name || "Lokasi Terdeteksi",
      },
    });
  } catch (error: any) {
    console.error("ERR_SAVE_REPORT:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal simpan laporan: " + error.message,
    });
  }
};

export const getLaporanHarian = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, branchId, userId } = req.query;
    const { _id: currentUserId, role } = req.user!;

    let query: any = {};

    // 1. LOGIKA SECURITY: Kalo Karyawan, PAKSA cuma bisa liat data dia sendiri
    if (role === "karyawan") {
      query.createdBy = currentUserId;
    } else if (role === "owner") {
      // Kalo Owner, bisa filter per karyawan atau per branch (opsional)
      if (userId) query.createdBy = new Types.ObjectId(userId as string);
      if (branchId) query.branch = new Types.ObjectId(branchId as string);
    }

    // 2. LOGIKA FILTER TANGGAL (Daily / Monthly / Range)
    if (startDate && endDate) {
      // Format input FE: "YYYY-MM-DD"
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      query.reportDate = { $gte: start, $lte: end };
    } else {
      // Default: Laporan Hari Ini
      const today = getNowJakarta().toDate();
      today.setHours(0, 0, 0, 0);
      query.reportDate = today;
    }

    // 3. TARIK DATA & POPULATE
    const reports = await LaporanHarianModel.find(query)
      .populate("branch", "name code")
      .populate("createdBy", "fullname username")
      .sort({ reportDate: -1 });

    // 4. LOGIKA AGGREGATION (Biar FE tinggal pajang Totalan)
    const summary = reports.reduce(
      (acc, curr) => {
        acc.totalRevenue += curr.totalRevenue;
        acc.totalOwner += curr.ownerShare;
        acc.totalEmployee += curr.employeeShare;
        acc.totalManagement += curr.managementShare;
        return acc;
      },
      {
        totalRevenue: 0,
        totalOwner: 0,
        totalEmployee: 0,
        totalManagement: 0,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Data Laporan Berhasil Ditarik, Bre!",
      summary, // Totalan buat dipajang di atas tabel
      data: reports, // Detail baris per baris
    });
  } catch (error: any) {
    console.error("ERR_GET_LAPORAN:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal narik data laporan: " + error.message,
    });
  }
};
