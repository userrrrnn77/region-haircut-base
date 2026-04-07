// index.ts

import "dotenv/config"; // masa ini di tambahin /config bre?

import os from 'os'
import app from "./src/app.js";
import connectDB from "./src/config/db.js";

const PORT = process.env.PORT || 5000;

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Cari yang IPv4 dan bukan internal (127.0.0.1)
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
};

const startServer = async () => {
  try {
    console.log("⏳ Menghubungkan ke MongoDB...");
    await connectDB();
    console.log("✅ MongoDB Terkoneksi!");

    if (process.env.NODE_ENV !== "production") {

      const localIp = getLocalIp()

      app.listen(PORT as number, "0.0.0.0", () => {
        console.log(
          `🚀 Server running in ${process.env.NODE_ENV || "development"} mode`,
        );
        console.log(`📍 Local: http://localhost:${PORT}`);
        console.log(`🌐 Network: http://${localIp}:${PORT}`); // Biar lu inget IP nya!
        console.log("-----------------------------------------");
      });
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("❌ Gagal menyalakan server:", error.message);
    }
    process.exit(1); // Matikan proses jika gagal total
  }
};

process.on("unhandledRejection", (err: unknown) => {
  if (err instanceof Error) {
    console.log("🚨 Unhandled Rejection:", err.message);
  }
  process.exit(1);
});

startServer();

export default app;
