// src/controllers/absensiController.ts

import type { Request, Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import AbsensiModel, { type IAbsensi } from "../models/Absensi.js";
import UserModel, { type UserDocument } from "../models/User.js";
import BranchModel, {
  type IBranchLocations,
} from "../models/BranchLocations.js";
import { deleteFromCloudinary } from "../middleware/uploadMiddleware.js";
import { Types } from "mongoose";

dayjs.extend(utc);
dayjs.extend(timezone);

export const JAKARTA_TZ = "Asia/Jakarta";

// =====
// UTILS
// =====

export const getNowJakarta = () => {
  return dayjs().tz(JAKARTA_TZ);
};

export const toUTCFile = (date: dayjs.Dayjs) => {
  return dayjs.utc().toDate();
};

export const getDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371000;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// =====
// TYPES
// =====

export interface AuthRequest extends Request {
  user?: UserDocument;
  file?: Express.Multer.File;
}

type PopulateUser = UserDocument & {
  branchLocations: IBranchLocations[];
};

// Checkin

export const checkIn = async (req: AuthRequest, res: Response) => {
  const cleanUpAbsensiError = async () => {
    if (req.file?.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
  };

  try {
    const { lat, lng, note } = req.body;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res
        .status(400)
        .json({ success: false, message: "KOordinat tidak valid" });
    }

    const nowJakarta = getNowJakarta();

    const user = (await UserModel.findById(req.user?._id).populate(
      "branchLocations",
    )) as PopulateUser | null;

    if (!user || !user.branchLocations.length) {
      return res.status(403).json({
        success: false,
        message: "User tidak punya lokasi kerja njir udah di pecat lu bre!",
      });
    }

    // === Cek sesi Terbuka & Reset Otomatis jam 00.00 ===

    const todayKey = nowJakarta.format("YYYY-MM-DD");

    const openSession = await AbsensiModel.findOne({
      user: new Types.ObjectId(user._id),
      isIncomplete: true,
    });

    if (openSession) {
      if (openSession.absensiDayKey !== todayKey) {
        // Kita anggap sesi kemaren hangus/tutup paksa
        await AbsensiModel.findByIdAndUpdate(openSession._id, {
          isIncomplete: false,
          note:
            (openSession.note || "") +
            " (Sesi ditutup otomatis oleh sistem karena ganti hari)",
        });
        // Setelah ditutup, lanjut proses check-in hari ini...
      } else {
        // Kalo emang masih hari yang sama, baru kita blokir
        return res.status(409).json({
          success: false,
          message: "Lu udah check-in tadi bre, sesi masih aktif!",
        });
      }
    }

    const sudahAbsen = await AbsensiModel.findOne({
      user: req.user?._id,
      absensiDayKey: todayKey,
      type: "masuk",
    });

    if (sudahAbsen) {
      return res.status(400).json({
        status: false,
        message: "Lu Udah Absen Mbot Hari ini njir, besok lagi mbot",
      });
    }

    // === Radius Cek ===
    let selectedBranch: any = null;
    let minDistance = Infinity;

    for (const loc of user.branchLocations) {
      const distance = getDistanceInMeters(
        latitude,
        longitude,
        loc.center.lat,
        loc.center.lng,
      );

      if (distance <= loc.radiusMeter) {
        selectedBranch = loc;
        minDistance = distance;
        break;
      }
    }

    if (!selectedBranch) {
      return res
        .status(403)
        .json({ success: false, message: "Lu Diluar Radius Kantor bre!!" });
    }

    // === LOGIC TOLERANSI JUMAT (JAM 1 SIANG) ===
    const isFriday = nowJakarta.day() === 5; // 5 itu Jumat
    let lateDeduction = 0;
    let lateNote = "";

    // Tentukan jam patokan: Jumat jam 13:10, selain itu 12:10
    const limitHour = isFriday ? 13 : 12;
    const limitMinute = 10;

    const limitTime = nowJakarta
      .startOf("day")
      .hour(limitHour)
      .minute(limitMinute)
      .second(0);

    // Cek telat atau kaga
    if (nowJakarta.isAfter(limitTime)) {
      lateDeduction = 5000; // Tetap 5rb ya mbot, bukan 5jt!
      lateNote = `(Potongan Telat - Checkin: ${nowJakarta.format("HH:mm")})`;
    }

    const finalNote = note ? `${note} ${lateNote}`.trim() : lateNote.trim();

    // === Absensi Key ===

    const absensiDayKey = nowJakarta.format("YYYY-MM-DD");

    const existing = await AbsensiModel.findOne({
      user: user._id,
      absensiDayKey,
      type: "masuk",
    });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Lu Udah Checkin Hari ini bre!!" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Harus Ada Foto Muke Elu bre anjg" });
    }

    // === Create Absensi ===

    const absensi = await AbsensiModel.create({
      user: user._id,
      absensiDayKey,
      type: "masuk",
      checkin: toUTCFile(nowJakarta),
      isIncomplete: true,
      branchLocation: selectedBranch._id,
      locationSnapShot: {
        name: selectedBranch.name,
        radiusMeter: selectedBranch.radiusMeter,
        center: selectedBranch.center,
      },
      photo: req.file?.path,
      location: {
        lat: latitude,
        lng: longitude,
      },
      distanceFromCenter: minDistance,
      note: finalNote || "-",
    });

    return res.status(201).json({
      success: true,
      message: "Checkin Berhasil Bre!",
      data: {
        ...absensi.toObject(),
        lateDeduction,
      },
    });
  } catch (error) {
    console.error("Error bre", error);
    await cleanUpAbsensiError();
    return res
      .status(500)
      .json({ success: false, message: "Gagal Checkin Bre coba ulang lagi" });
  }
};

// Chekcout

export const checkOut = async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng, note } = req.body;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res
        .status(400)
        .json({ success: false, message: "Koordinat tidak valid bre" });
    }

    const user = req.user as unknown as UserDocument;
    const userId = user._id;

    const absensiRecord: any = (await AbsensiModel.findOne({
      user: new Types.ObjectId(userId),
      isIncomplete: true,
    }).populate("branchLocation")) as IAbsensi;

    if (!absensiRecord) {
      return res
        .status(400)
        .json({ success: false, message: "Tidak Ada Sesi Kerja Aktif bre!!" });
    }

    const nowJakarta = getNowJakarta();

    const center =
      absensiRecord.locationSnapShot?.center ||
      absensiRecord.branchLocation?.center;

    const radius =
      absensiRecord.locationSnapShot?.radiusMeter ||
      absensiRecord.branchLocation?.radiusMeter;

    const distance = getDistanceInMeters(
      latitude,
      longitude,
      center.lat,
      center.lng,
    );

    if (distance > radius) {
      return res.status(403).json({
        success: false,
        message: "Harus Di kantor bre kalo mau checkout",
      });
    }

    const checkInTime = dayjs(absensiRecord.checkin);

    const diffMs = nowJakarta.diff(checkInTime);
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const finalNote = note
      ? `${note} (Durasi Kerja: ${diffHrs}j ${diffMins} m)`
      : `Checkout Sukses (Durasi Kerja: ${diffHrs}j ${diffMins}m)`;

    const updateRecord = await AbsensiModel.findOneAndUpdate(
      {
        _id: absensiRecord._id,
        isIncomplete: true,
      },
      {
        type: "keluar",
        checkout: toUTCFile(nowJakarta),
        isIncomplete: false,
        note: finalNote,
      },
      {
        new: true,
      },
    );

    if (!updateRecord) {
      return res
        .status(409)
        .json({ success: false, messgae: "Double req Bre NJing" });
    }

    return res.status(200).json({
      success: true,
      message: `Checkout berhasil Durasi Kerja: ${diffHrs}j ${diffMins}m`,
      data: updateRecord,
    });
  } catch (error) {
    console.log("Error Checkout", error);

    return res
      .status(500)
      .json({ success: false, message: "Gagal Checkout Coba ulangi bre!!!" });
  }
};

// Absen Sakit MBOT

export const absenSakit = async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng, note } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Kirim Bukit Surat Dokter bre atau Resep Obat njir, jangan resep narkoba ya bre",
      });
    }

    const now = getNowJakarta();
    const absensiDayKey = now.format("YYYY-MM-DD");

    const user = req.user as unknown as UserDocument;
    const userId = user._id;

    const existing = await AbsensiModel.findOne({
      user: new Types.ObjectId(userId),
      absensiDayKey,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Hari ini udah absen bre anjir menuhin db aja elu bgsd",
      });
    }

    const absensi = await AbsensiModel.create({
      user: new Types.ObjectId(userId),
      absensiDayKey,
      type: "sakit",
      photo: req.file?.path,
      location: {
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
      },
      note: note || "Izin Sakit",
      isIncomplete: false,
    });

    return res.status(201).json({
      success: true,
      message:
        "Izin Sakit terkirim bre, istirahat bener bener jangan liburan lu anjg",
      data: absensi,
    });
  } catch (error) {
    console.log("Error Izin Sakit bre", error);
    return res.status(500).json({
      success: false,
      message: "Gagal Izin Sakit Bre Lu Harus kerja njir mampus",
    });
  }
};

// Ambil Semua Absen Bre

export const getAllAbsensi = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, username } = req.query;

    let query: Record<string, any> = {};

    const start = startDate as string | undefined;
    const end = endDate as string | undefined;
    const uname = username as string | undefined;

    if (start) {
      if (end) {
        query.absensiDayKey = { $gte: start, $lte: end };
      } else {
        query.absensiDayKey = start;
      }
    }

    if (uname) {
      const user = await UserModel.findOne({ uname });
      if (user) {
        query.user = user._id;
      } else {
        return res.status(200).json({ success: true, allAbsensi: [] });
      }
    }

    const allAbsensi = await AbsensiModel.find(query)
      .populate("user", "fullname username role")
      .populate("branchLocation", "name")
      .sort({ absensiDayKey: -1 });

    return res.status(200).json({
      success: true,
      message: "Suksen Bre Narik Data anjay",
      data: allAbsensi,
    });
  } catch (error) {
    console.log("Error Ambil Semua Absen bre", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal Ambil Semua Absen bre" });
  }
};

// Ambil Absenku saja

export const getMyAbsensi = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const user = req.user as unknown as UserDocument;

    let query: Record<string, any> = { user: new Types.ObjectId(user._id) };

    if (startDate && endDate) {
      query.absensiDayKey = { $gte: startDate, $lte: endDate };
    }

    const myAbsensi = await AbsensiModel.find(query)
      .populate("branchLocation", "name")
      .sort({ absensiDayKey: -1 });

    return res.status(200).json({
      success: true,
      message: "Riwayat Absen lu nih mbot",
      data: myAbsensi,
    });
  } catch (error) {
    console.log("Error Narik Data bre", error);
    return res.status(500).json({ success: false, message: "Error Bre anjg" });
  }
};
