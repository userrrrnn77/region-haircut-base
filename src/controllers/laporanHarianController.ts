// src/controllers/laporanHarianController.ts

import type { Response } from "express";
import LaporanHarianModel, { ILaporanHarian } from "../models/LaporanHarian.js";
import AbsensiModel from "../models/Absensi.js";
import {
  getNowJakarta,
  JAKARTA_TZ,
  type AuthRequest,
} from "./absensiController.js";
import { Types } from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import ExcelJS from "exceljs";

dayjs.extend(utc);
dayjs.extend(timezone);

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

    const selectedBranch = userAbsensi.branchLocation;

    const filter = {
      reportDate: targetDate,
      branch: Array.isArray(selectedBranch)
        ? selectedBranch[0]
        : selectedBranch, // Paksa ambil satu, jangan serakah!
      createdBy: req.user?._id,
    };

    const update = {
      totalRevenue: Math.round(totalRevenue),
      notes: autoNote || "-",
      managementExpenses: processedExpenses,
      reportDate: targetDate, // Tetap sertakan buat upsert
      branch: userAbsensi.branchLocation,
      createdBy: req.user?._id,
    };

    // 4. UPSERT LOGIC (Sesuai Compound Index: Date + Branch + User)
    // Otomatis itung share 50-40-10 via Pre-Save Hook di Model
    const report = (await LaporanHarianModel.findOneAndUpdate(
      filter as any,
      {
        $set: {
          totalRevenue: Math.round(totalRevenue),
          notes: autoNote || "-",
          managementExpenses: processedExpenses,
          reportDate: targetDate,
          branch: userAbsensi.branchLocation,
          createdBy: req.user?._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        includeResultMetadata: false,
      },
    ).exec()) as unknown as ILaporanHarian;

    if (!report) {
      throw new Error("Gagal dapet/bikin report, mbot!");
    }

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
        totalJajan: (report as any).totalManagementExpenses,
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

export const exportLaporanHarian = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, branchId, userId } = req.query;
    const { _id: currentUserId, role } = req.user!;

    let query: any = {};

    // 1. SECURITY: Karyawan cuma bisa export data sendiri
    if (role === "karyawan") {
      query.createdBy = currentUserId;
    } else if (role === "owner") {
      if (userId) query.createdBy = new Types.ObjectId(userId as string);
      if (branchId) query.branch = new Types.ObjectId(branchId as string);
    }

    // 2. FILTER TANGGAL - PAKE getNowJakarta()
    if (startDate && endDate) {
      const start = dayjs
        .tz(startDate as string, JAKARTA_TZ)
        .startOf("day")
        .toDate();
      const end = dayjs
        .tz(endDate as string, JAKARTA_TZ)
        .endOf("day")
        .toDate();
      query.reportDate = { $gte: start, $lte: end };
    } else {
      const nowJkt = getNowJakarta();
      const start = nowJkt.startOf("month").toDate();
      const end = nowJkt.endOf("month").toDate();
      query.reportDate = { $gte: start, $lte: end };
    }

    // 3. TARIK DATA
    const reports = await LaporanHarianModel.find(query)
      .populate("branch", "name code")
      .populate("createdBy", "fullname username")
      .populate("managementExpenses.createdBy", "fullname")
      .sort({ reportDate: 1 })
      .lean();

    if (!reports.length) {
      return res.status(404).json({
        success: false,
        message: "Kaga ada data buat di-export bre",
      });
    }

    // 4. MAPPING DATA HARIAN
    const dataRows = reports.map((r) => ({
      Tanggal: dayjs(r.reportDate).tz(JAKARTA_TZ).format("DD-MM-YYYY"),
      Cabang: (r.branch as any)?.name || "-",
      Karyawan: (r.createdBy as any)?.fullname || "-",
      "Total Omzet": r.totalRevenue || 0,
      "Jatah Owner (50%)": r.ownerShare || 0,
      "Gaji Karyawan (40%)": r.employeeShare || 0,
      "Kas Management (10%)": r.managementShare || 0,
      "Total Jajan": (r as any).totalManagementExpenses || 0,
      "Net Management": (r as any).managementNet || 0,
      "WAJIB SETOR CASH": (r as any).totalCashToDeposit || 0,
      "Rincian Jajan":
        r.managementExpenses
          ?.map(
            (ex: any) =>
              `${ex.description} (${ex.amount.toLocaleString("id-ID")})`,
          )
          .join(", ") || "-",
      Catatan: r.notes || "-",
    }));

    // 5. TOTALAN PER USER
    const userSalaries: { [key: string]: number } = {};
    reports.forEach((r) => {
      const name = (r.createdBy as any)?.fullname || "Unknown";
      userSalaries[name] = (userSalaries[name] || 0) + (r.employeeShare || 0);
    });

    const userSalaryRows = Object.keys(userSalaries).map((name) => ({
      Tanggal: "REKAP GAJI",
      Cabang: "",
      Karyawan: name,
      "Total Omzet": "",
      "Jatah Owner (50%)": "",
      "Gaji Karyawan (40%)": userSalaries[name],
      "Kas Management (10%)": "",
      "Total Jajan": "",
      "Net Management": "",
      "WAJIB SETOR CASH": "",
      "Rincian Jajan": `Total Gaji ${name}`,
      Catatan: "",
    }));

    // 6. GRAND TOTAL
    const totals = reports.reduce(
      (acc, curr) => ({
        omzet: acc.omzet + (curr.totalRevenue || 0),
        owner: acc.owner + (curr.ownerShare || 0),
        gaji: acc.gaji + (curr.employeeShare || 0),
        kas: acc.kas + (curr.managementShare || 0),
        jajan: acc.jajan + ((curr as any).totalManagementExpenses || 0),
        setor: acc.setor + ((curr as any).totalCashToDeposit || 0),
      }),
      { omzet: 0, owner: 0, gaji: 0, kas: 0, jajan: 0, setor: 0 },
    );

    // 7. GABUNGIN SEMUA
    const finalData = [
      ...dataRows,
      {}, // Baris kosong
      { Tanggal: "--- RINCIAN GAJI PER KARYAWAN ---" },
      ...userSalaryRows,
      {}, // Baris kosong
      {
        Tanggal: "GRAND TOTAL",
        Cabang: "",
        Karyawan: "REKAP KESELURUHAN",
        "Total Omzet": totals.omzet,
        "Jatah Owner (50%)": totals.owner,
        "Gaji Karyawan (40%)": totals.gaji,
        "Kas Management (10%)": totals.kas,
        "Total Jajan": totals.jajan,
        "Net Management": "",
        "WAJIB SETOR CASH": totals.setor,
        "Rincian Jajan": "--- SELESAI ---",
        Catatan: `Total Gaji Semua: ${totals.gaji.toLocaleString("id-ID")}`,
      },
    ];

    // 8. BIKIN EXCEL
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Rekap_Lengkap");

    // DEFINE COLUMNS DULU BIAR GA ERROR TS
    worksheet.columns = [
      { header: "Tanggal", key: "Tanggal", width: 15 },
      { header: "Cabang", key: "Cabang", width: 20 },
      { header: "Karyawan", key: "Karyawan", width: 25 },
      { header: "Total Omzet", key: "Total Omzet", width: 18 },
      { header: "Jatah Owner (50%)", key: "Jatah Owner (50%)", width: 20 },
      { header: "Gaji Karyawan (40%)", key: "Gaji Karyawan (40%)", width: 22 },
      {
        header: "Kas Management (10%)",
        key: "Kas Management (10%)",
        width: 22,
      },
      { header: "Total Jajan", key: "Total Jajan", width: 15 },
      { header: "Net Management", key: "Net Management", width: 18 },
      { header: "WAJIB SETOR CASH", key: "WAJIB SETOR CASH", width: 20 },
      { header: "Rincian Jajan", key: "Rincian Jajan", width: 40 },
      { header: "Catatan", key: "Catatan", width: 30 },
    ];

    // Add data
    worksheet.addRows(finalData);

    // Auto width ulang biar lebih presisi
    worksheet.columns.forEach((column) => {
      if (!column.eachCell) return;
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    // Styling header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Format angka
    ["D", "E", "F", "G", "H", "I", "J"].forEach((col) => {
      worksheet.getColumn(col).numFmt = "#,##0";
    });

    // Bold untuk baris REKAP & GRAND TOTAL
    worksheet.eachRow((row) => {
      const firstCell = row.getCell(1).value;
      if (
        firstCell === "--- RINCIAN GAJI PER KARYAWAN ---" ||
        firstCell === "GRAND TOTAL"
      ) {
        row.font = { bold: true };
        if (firstCell === "GRAND TOTAL") {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF3C7" },
          };
        }
      }
    });

    // 9. KIRIM RESPONSE
    const periode = startDate
      ? dayjs.tz(startDate as string, JAKARTA_TZ).format("MMM_YYYY")
      : getNowJakarta().format("MMM_YYYY");
    const filename = `Rekap_Full_${periode}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error("ERR_EXPORT_LAPORAN:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal export laporan: " + error.message,
    });
  }
};
