// index.ts

import "dotenv/config"; // masa ini di tambahin /config bre?

import app from "./src/app";
import connectDB from "./src/config/db";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log("⏳ Menghubungkan ke MongoDB...");
    await connectDB();
    console.log("✅ MongoDB Terkoneksi!");

    if (process.env.NODE_ENV !== "production") {
      app.listen(PORT as number, "0.0.0.0", () => {
        console.log(
          `🚀 Server running in ${process.env.NODE_ENV || "development"} mode`,
        );
        console.log(`📍 Local: http://localhost:${PORT}`);
        console.log(`🌐 Network: http://192.168.1.6:${PORT}`); // Biar lu inget IP nya!
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
