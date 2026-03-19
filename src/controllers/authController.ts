// src/controllers/authController.ts

import type { Request, Response, NextFunction } from "express";
import UserModel, { type UserDocument } from "../models/User";
import jwt from "jsonwebtoken";
import { deleteFromCloudinary } from "../middleware/uploadMiddleware";

export interface AuthRequest extends Request {
  user?: UserDocument;
  file?: Express.Multer.File; 
}

const generateToken = (userId: string, role: string): string => {
  const sekarang = new Date();
  const besok = new Date();
  besok.setHours(24, 0, 0, 0);

  let sisaWaktu = Math.floor((besok.getTime() - sekarang.getTime()) / 1000);

  if (sisaWaktu < 3600) sisaWaktu = 3600;

  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET as string, {
    expiresIn: sisaWaktu,
  });
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email Dan Password Wajib di ISI MBOT",
      });
      return;
    }

    const user = await UserModel.findOne({ email })
      .select("+password")
      .populate("branchLocations");

    if (!user) {
      res
        .status(404)
        .json({ success: false, message: "User Tidak Ditemukan Bre!" });
      return;
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: "Password Salah Mamposs INget inget dulu bre!!",
      });
      return;
    }

    const token = generateToken(user._id.toString(), user.role);
    const userData = user.toObject();
    delete (userData as Partial<UserDocument>).password;

    res
      .status(200)
      .json({ success: true, message: "Login Sukses", token, user: userData });
  } catch (error) {
    res.status(500).json({ success: false, message: "LOGIN GAGAL!!!" });
    return;
  }
};

export const updateMe = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user?._id);
    if (!user) {
      res
        .status(404)
        .json({ success: false, message: "User Tidak Ditemukan bre" });
      return;
    }

    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (username) user.username = username;
    if (password) user.password = password;

    if (req.file) {
      if (user.avatar) {
        await deleteFromCloudinary(user.avatar);
      }
      user.avatar = req.file.path;
    }

    await user.save();

    const updateUser = user.toObject();
    delete (updateUser as Partial<UserDocument>).password;

    res.status(200).json({
      success: true,
      message: "Berhasil Update bre Mantap!",
      updateUser,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Gagal Update Bre Mamposs" });
  }
};
