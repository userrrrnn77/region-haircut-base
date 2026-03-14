import os from "os";
import dotenv from "dotenv";
import mongoose from "mongoose";
import UserModel from "./src/models/User.ts"; // Pastiin path ini bener sesuai folder lu mbot!

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "";

// --- 1. SCRIPT CARI IP (Biar lu kaga pusing cek terminal) ---
const interfaces = os.networkInterfaces();
let localIp = "";

for (const name in interfaces) {
  const ifaceList = interfaces[name];
  if (!ifaceList) continue;

  for (const iface of ifaceList) {
    if (iface.family === "IPv4" && !iface.internal) {
      const isPhysical =
        name.includes("Wi-Fi") ||
        name.includes("Ethernet") ||
        name.includes("wlan") ||
        name.includes("en");
      const isVirtual = name.includes("vEthernet") || name.includes("Virtual");

      if (isPhysical && !isVirtual) {
        localIp = iface.address;
        break;
      }
    }
  }
  if (localIp) break;
}

// --- 2. SCRIPT AUTO-CREATE OWNER (Biar kelar urusan login lu!) ---
// const seedOwner = async () => {
//   try {
//     if (!MONGO_URI) throw new Error("MONGO_URI kaga ada di .env mbot!");

//     console.log("-----------------------------------------");
//     console.log("⏳ Menghubungkan ke MongoDB...");
//     await mongoose.connect(MONGO_URI);
//     console.log("✅ MongoDB Terkoneksi!");

//     // Bersihin data lama biar kaga duplicate key error bgsd!
//     await UserModel.deleteMany({ email: "owner@owner.com" });
//     console.log("🧹 Data lama owner@owner.com dibersihkan.");

//     // Bikin User Owner Baru
//     const owner = new UserModel({
//       username: "bos_elit",
//       fullname: "Owner Haircut Region",
//       email: "owner@owner.com",
//       password: "testing77", // Ini otomatis di-hash sama pre-save middleware lu!
//       role: "owner",
//       avatar: "https://ui-avatars.com/api/?name=Owner",
//       authMethod: "local",
//       branchLocations: [],
//     });

//     await owner.save();

//     console.log("🚀 AKUN OWNER SIAP DIPAKE!");
//     console.log(`📧 Email: owner@owner.com`);
//     console.log(`🔑 Password: testing77`);
//     console.log("-----------------------------------------");
//   } catch (error: any) {
//     console.error("❌ Gagal Seeding Owner:", error.message);
//   } finally {
//     // Jangan diclose biar server tetep keliatan IP-nya kalau lu mau pake buat monitor
//     // await mongoose.connection.close();
//   }
// };

// // Eksekusi
// seedOwner().then(() => {
//   console.log(`📍 Server jalan di: http://localhost:${PORT}`);
//   console.log(`📱 Cek via HP di: http://${localIp || "IP_GAGAL"}:${PORT}`);
//   console.log("-----------------------------------------");
// });
