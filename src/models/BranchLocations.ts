// src/models/BranchLocations.ts

import { Schema, Document, model } from "mongoose";

export interface IBranchLocations extends Document {
  code: string;
  role: "karyawan";
  name: string;
  center: { lat: number; lng: number };
  radiusMeter: number;
  isActive: boolean;
}

const BranchLocationsSchema = new Schema<IBranchLocations>(
  {
    code: {
      type: String,
      required: [true, "Kode Lokasi Wajib diisi"],
      trim: true,
      uppercase: true,
    },
    role: {
      type: String,
      required: [true, "Divisi Role Wajib Ditentukan"],
      enum: ["karyawan"],
    },
    name: {
      type: String,
      required: [true, "Nama Lokasi Wajib DI isi"],
      trim: true,
    },
    center: {
      lat: {
        type: Number,
        required: [true, "Latidtude Wajib Di isi"],
      },
      lng: {
        type: Number,
        required: [true, "Longitude Wajib DI isi"],
      },
    },
    radiusMeter: {
      type: Number,
      required: [true, "Radius (Meter) wajib di tentukan"],
      default: 7,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

BranchLocationsSchema.index({ code: 1, role: 1 }, { unique: true });

const BranchModel = model<IBranchLocations>(
  "BranchLocations",
  BranchLocationsSchema,
);

export default BranchModel;
