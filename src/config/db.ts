// backend\src\config\db.ts

import mongoose from "mongoose";
import "dotenv/config";

const MONGO_URI = process.env.MONGO_URI;

declare global {
  var mongoose: { conn: any; promise: any } | undefined;
}

if (!MONGO_URI) {
  throw new Error("MONGO_URI tidak ditemukan di environment variables");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: true, // Ubah jadi TRUE biar aman pas lagi nunggu koneksi
    };

    // FIX TYPO: Pakai 'promise', bukan 'process'
    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
      console.log("✅ MongoDB Connected, Bre!");
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // Reset promise kalau gagal biar bisa retry
    console.error("❌ DB Connection Error:", (e as Error).message);
    throw e;
  }

  return cached.conn;
};

export default connectDB;
