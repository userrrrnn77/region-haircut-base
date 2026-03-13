// src/app.ts

import express, { type NextFunction, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import indexRoutes from "./routes/indexRoutes.ts";
import type { AuthRequest } from "./middleware/authMiddleware.ts";

const app = express();

app.set("trust proxy", 1);

// app.use((req: AuthRequest, res: Response, next: NextFunction) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header(
//     "Access-Control-Allow-Methods",
//     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
//   );
//   res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

//   if (req.method === "OPTIONS") {
//     return res.status(200).end();
//   }
//   next();
// });

app.use(helmet());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // Tambahkan PATCH!
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logger untuk development
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ===== Routes =====
app.use("/api", indexRoutes);

// ===== Health Check =====
app.get("/", (req: AuthRequest, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Backend Haircut Region JosJis",
    timestamp: new Date(),
  });
});

// ===== 404 Handler (Route tidak ditemukan) =====
app.use((req: AuthRequest, res: Response) => {
  return res
    .status(404)
    .json({ message: `Endpoint ${req.originalUrl} Tidak Ditemukan` });
});

// ===== Global Error Handler (Jika ada error tak terduga) =====
app.use((err: unknown, req: AuthRequest, res: Response, next: NextFunction) => {
  if (err instanceof Error) {
    console.error("SERVER ERROR", err.stack);
    return res.status(500).json({
      message: `Terjadi Kesalahan Pada Internal Server`,
      error: process.env.NODE_ENV === "development" ? err.message : null,
    });
  }

  // Kalo error-nya ghoib (bukan instance of Error)
  console.error("GHOIB ERROR:", err);
  return res.status(500).json({
    success: false,
    message: "Anjir, ada error ghoib bre, kaga tau apaan!",
    error: process.env.NODE_ENV === "development" ? err : null,
  });
});

export default app;
