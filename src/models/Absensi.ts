// src/models/Absensi.ts

import { Schema, Document, model, Types } from "mongoose";

export interface IAbsensi extends Document {
  user: Types.ObjectId;
  absensiDayKey?: string;
  type?: "masuk" | "keluar" | "sakit";
  checkin?: Date;
  checkout?: Date;
  isIncomplete?: boolean;
  branchLocation?: Schema.Types.ObjectId[];
  locationSnapShot?: {
    name?: string;
    radiusMeter?: number;
    center?: {
      lat?: number;
      lng?: number;
    };
  };
  photo?: string;
  location?: { lat: number; lng: number };
  distanceFromCenter?: number;
  note?: string;
  createdAt: Date; 
  updatedAt: Date;
}

const AbsensiSchema = new Schema<IAbsensi>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    absensiDayKey: { type: String, required: true },
    type: {
      type: String,
      enum: ["masuk", "keluar", "sakit"],
      default: "masuk",
    },
    checkin: { type: Date, default: Date.now },
    checkout: { type: Date },
    isIncomplete: { type: Boolean, default: false },
    branchLocation: [{ type: Schema.Types.ObjectId, ref: "BranchLocations" }],
    locationSnapShot: {
      name: { type: String },
      radiusMeter: { type: Number },
      center: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    photo: { type: String },
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    distanceFromCenter: { type: Number },
    note: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

AbsensiSchema.index({ user: 1, absensiDayKey: 1, type: 1 }, { unique: true });
AbsensiSchema.index({ createdAt: -1 });
AbsensiSchema.index({ user: 1, createdAt: -1 });
AbsensiSchema.index(
  { user: 1, isIncomplete: 1 },
  { unique: true, partialFilterExpression: { isIncomplete: true } },
);

const AbsensiModel = model<IAbsensi>("Absensi", AbsensiSchema);

export default AbsensiModel;
