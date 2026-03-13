# ✂️ Region Haircut - Backend Engine (JosJis Edition)

Backend sistem manajemen operasional Barbershop berbasis **Bun** dan **TypeScript**. Dibangun dengan arsitektur yang fokus pada keamanan (Rate Limiting & Helmet), akurasi GPS (Haversine Formula), dan transparansi pembagian hasil otomatis.

## 🚀 Tech Stack
- **Runtime:** [Bun](https://bun.sh/) (Fast all-in-one JS runtime)
- **Language:** TypeScript (Strict Typing)
- **Framework:** Express.js
- **Database:** MongoDB via Mongoose
- **Storage:** Cloudinary (Avatar & Evidence Photos)
- **Security:** JWT, BcryptJS, Helmet, & Express Rate Limit
- **Timezone:** Day.js (Locked to `Asia/Jakarta`)

---

## 🏗️ Core Features & Architecture

### 1. Smart Absensi (GPS Locked)
Sistem absen yang mengunci lokasi karyawan berdasarkan radius (meter) dari titik koordinat kantor. 
- **Anti-Fraud:** Menggunakan `isIncomplete` flag untuk mencegah sesi kerja ganda.
- **Evidence Based:** Wajib upload foto muke/bukti sakit yang langsung tersimpan di Cloudinary.

### 2. Automated Share Calculation (50/40/10)
Setiap laporan harian yang masuk otomatis dihitung jatahnya melalui *Pre-save Hooks* di level Database:
- **50%** Jatah Owner
- **40%** Jatah Karyawan (Gaji Langsung Terhitung)
- **10%** Jatah Management

### 3. Security Brahmana Level
- **Rate Limiting:** Proteksi dari Brute Force pada endpoint Login & Absensi.
- **Dynamic JWT:** Token expired otomatis saat pergantian hari (00:00 WIB).
- **Environment Safety:** Interface `ProcessEnv` yang terinisialisasi ketat di `env.d.ts`.

---

## 📂 Project Structure
```text
.
├── src/
│   ├── config/         # Database & Cloudinary Connection
│   ├── controllers/    # Business Logic (Absen, Auth, Laporan, User)
│   ├── middleware/     # Auth, Role-Check, Upload, & Rate Limiter
│   ├── models/         # Mongoose Schemas & Virtuals
│   ├── routes/         # Endpoint Mapping
│   ├── types/          # TypeScript Definitions (.d.ts)
│   └── app.ts          # Express App Configuration
├── index.ts            # Entry Point (Heart of the App)
└── package.json        # Dependencies & Scripts