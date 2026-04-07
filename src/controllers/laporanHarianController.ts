// src/controllers/laporanHarianController.ts

import type { Response } from "express";
import LaporanHarianModel from "../models/LaporanHarian.js";
import AbsensiModel from "../models/Absensi.js";
import { getNowJakarta, type AuthRequest } from "./absensiController.js";
import { Types } from "mongoose";
import dayjs from "dayjs";

/**
 * Controller Setor Cuan Akhir Shift
 * Otomatis deteksi Branch dari Absensi Hari Ini + Opsional Pengeluaran (managementExpenses)
 */
export const saveManualReport = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Ambil input dari body (managementExpenses sifatnya OPSIONAL)
    const { totalRevenue, notes, managementExpenses } = req.body;

    // Validasi basic omzet
    if (totalRevenue === undefined || totalRevenue < 0) {
      return res.status(400).json({
        success: false,
        message: "Input cuan yang bener, mbot! Jangan kosong atau minus!",
      });
    }

    const nowJakarta = getNowJakarta();
    const todayKey = nowJakarta.format("YYYY-MM-DD");
    const targetDate = nowJakarta.toDate();
    targetDate.setHours(0, 0, 0, 0);

    // 2. OTOMATISASI BRANCH (Cari lokasi kerja dari absen terakhir hari ini)
    const userAbsensi = await AbsensiModel.findOne({
      user: req.user?._id,
      absensiDayKey: todayKey,
      type: { $in: ["masuk", "keluar"] },
    });

    if (!userAbsensi || !userAbsensi.branchLocation) {
      return res.status(403).json({
        success: false,
        message:
          "Lu belum absen hari ini, mbot! Kaga bisa setor cuan kalo kaga kerja!",
      });
    }

    let lateDeduction = 0;
    let autoNote = "-";

    if (userAbsensi.checkin) {
      const checkInTime = dayjs(userAbsensi.checkin).tz("Asia/Jakarta");

      const limitTime = checkInTime
        .startOf("day")
        .hour(12)
        .minute(10)
        .second(0);

      if (checkInTime.isAfter(limitTime)) {
        lateDeduction = 5000;
        autoNote =
          `${autoNote} (Potongan Telat 5rb - Checkin: ${checkInTime.format("HH:mm")})`.trim();
      }
    }

    // 3. LOGIC EXPENSES (Proses list jajan/pengeluaran kalo ada)
    let processedExpenses: any[] = [];
    if (managementExpenses && Array.isArray(managementExpenses)) {
      processedExpenses = managementExpenses.map((exp: any) => ({
        description: exp.description,
        amount: Math.round(exp.amount),
        createdBy: req.user?._id, // Siapa yang lapor pengeluaran
        isVerified: true, // Default false, nunggu Owner ACC
      }));
    }

    // 4. UPSERT LOGIC (Sesuai Compound Index: Date + Branch + User)
    // Otomatis itung share 50-40-10 via Pre-Save Hook di Model
    const report = await LaporanHarianModel.findOneAndUpdate(
      {
        reportDate: targetDate,
        branch: userAbsensi.branchLocation,
        createdBy: req.user?._id,
      },
      {
        totalRevenue: Math.round(totalRevenue),
        notes: autoNote || "-",
        managementExpenses: processedExpenses, // Simpan array pengeluaran (kalo kosong ya [])
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

    if (lateDeduction > 0 && report) {
      const finalEmployeeShare = report.employeeShare - lateDeduction;
      const finalManagementShare = report.managementShare + lateDeduction;

      await LaporanHarianModel.updateOne(
        { _id: report._id },

        {
          $set: {
            employeeShare: finalEmployeeShare,
            managementShare: finalManagementShare,
          },
        },
      );

      report.employeeShare = finalEmployeeShare;
      report.managementShare = finalManagementShare;
    }

    // 5. RESPONSE (Model otomatis itung employeeShare/jatah 40%)
    return res.status(201).json({
      success: true,
      message:
        lateDeduction > 0
          ? "Setor Cuan Sukses (Ada potongan telat!)"
          : "Setoran Cuan Sukses, Bre!",
      data: {
        tanggal: todayKey,
        omzet: report.totalRevenue,
        jatahLu: report.employeeShare,
        totalJajan: (report as any).totalManagementExpenses, // Info total pengeluaran hari ini
        branch: userAbsensi.locationSnapShot?.name || "Lokasi Terdeteksi",
        lateDeduction: lateDeduction,
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
    // Update di getLaporanHarian (Backend)
    if (startDate && endDate) {
      // Kita paksa start ke 00:00:00 dan end ke 23:59:59 waktu Jakarta
      // startDate dari FE: "2026-03-01"
      const start = dayjs
        .tz(startDate as string, "Asia/Jakarta")
        .startOf("day")
        .toDate();
      const end = dayjs
        .tz(endDate as string, "Asia/Jakarta")
        .endOf("day")
        .toDate();

      query.reportDate = { $gte: start, $lte: end };
    } else {
      // Default: Ambil hari ini versi Jakarta
      const today = getNowJakarta().startOf("day").toDate();
      query.reportDate = today;
    }

    // 3. TARIK DATA & POPULATE
    const reports = await LaporanHarianModel.find(query)
      .populate("branch", "name code")
      .populate("createdBy", "fullname username")
      .sort({ reportDate: -1 });

    // 4. LOGIKA AGGREGATION (Summary kumulatif di UI)
    const summary = reports.reduce(
      (acc, curr) => {
        acc.totalRevenue += curr.totalRevenue;
        acc.totalOwner += curr.ownerShare;
        acc.totalEmployee += curr.employeeShare;
        acc.totalManagement += curr.managementShare;
        acc.totalExpenses += (curr as any).totalManagementExpenses || 0;

        // TRIK SENYAP: Cek apakah di notes ada tulisan "Potongan Telat"
        // Karena tadi di saveManualReport kita selipin tulisan itu di notes
        if (curr.notes && curr.notes.includes("Potongan Telat 5rb")) {
          acc.totalLateDeduction += 5000;
        }

        return acc;
      },
      {
        totalRevenue: 0,
        totalOwner: 0,
        totalEmployee: 0,
        totalManagement: 0,
        totalExpenses: 0,
        totalLateDeduction: 0, // Tambahin inisialisasi ini
      },
    );

    return res.status(200).json({
      success: true,
      message: "Data Laporan Berhasil Ditarik, Bre!",
      summary: {
        ...summary,
        // Kalkulasi sisa dompet management setelah jajan
        managementNet: summary.totalManagement - summary.totalExpenses,
        // Angka keramat: Duit fisik yang harus lu terima
        totalCashToDeposit: summary.totalRevenue - summary.totalExpenses,
      },
      data: reports,
    });
  } catch (error: any) {
    console.error("ERR_GET_LAPORAN:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal narik data laporan: " + error.message,
    });
  }
};
