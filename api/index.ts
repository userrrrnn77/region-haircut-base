// api/index.ts

import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import type { Request, Response } from "express";
import "dotenv/config";

// cache connection biar gak reconnect tiap request
let isConnected = false;

export default async function handler(req: Request, res: Response) {
  console.log("RUNNING NEW BUILD 🚀");
  // ✅ HANDLE CORS DI LEVEL PALING ATAS (ANTI ERROR)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS,PATCH",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ✅ HANDLE PREFLIGHT (INI YANG FIX ERROR LU)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // ✅ CONNECT DB SEKALI AJA (SERVERLESS SAFE)
    if (!isConnected) {
      console.log("⏳ Connecting MongoDB...");
      await connectDB();
      isConnected = true;
      console.log("✅ MongoDB Connected!");
    }

    // ✅ PASS KE EXPRESS
    return app(req, res);
  } catch (error: any) {
    console.error("🚨 Handler Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
}
