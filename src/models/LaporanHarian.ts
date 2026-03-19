// src/models/LaporanHarian.ts

import mongoose, { Schema, Document, Types, Model } from "mongoose";

interface IExpense {
  description: string;
  amount: number;
  createdBy: Types.ObjectId;
  isVerified: boolean; // Tetap ada buat jaga-jaga kalau mau diaudit manual
}

export interface ILaporanHarian extends Document {
  reportDate: Date;
  totalRevenue: number;
  branch: Types.ObjectId;
  ownerShare: number; // 50% (Suci)
  employeeShare: number; // 40% (Suci)
  managementShare: number; // 10% (Bruto Management)
  managementExpenses: IExpense[];
  createdBy: Types.ObjectId;
  notes?: string;

  // Virtuals
  totalManagementExpenses: number;
  managementNet: number;
  isManagementDeficit: boolean;
  totalCashToDeposit: number;

  addExpense(description: string, amount: number, userId: Types.ObjectId): void;
}

interface ILaporanHarianModel extends Model<ILaporanHarian> {
  getMonthlySummary(
    month: number,
    year: number,
    branchId?: string,
  ): Promise<any>;
}

// --- SUB-SCHEMA EXPENSE ---
const ExpenseSchema = new Schema<IExpense>(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isVerified: { type: Boolean, default: true }, // SET TRUE: Mazhab Kepercayaan Penuh
  },
  { _id: true, timestamps: true },
);

// --- MAIN SCHEMA ---
const LaporanHarianSchema = new Schema<ILaporanHarian>(
  {
    reportDate: { type: Date, required: true },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "BranchLocations",
      required: true,
    },
    totalRevenue: { type: Number, required: true, default: 0, min: 0 },
    ownerShare: { type: Number, default: 0 },
    employeeShare: { type: Number, default: 0 },
    managementShare: { type: Number, default: 0 },
    managementExpenses: { type: [ExpenseSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- LOGIC SHARE CALCULATOR ---
const calculateShares = (doc: any) => {
  const rev = doc.totalRevenue || 0;
  // Pembulatan ke bawah biar aman di kas
  doc.ownerShare = Math.floor(rev * 0.5);
  doc.employeeShare = Math.floor(rev * 0.4);
  doc.managementShare = Math.floor(rev * 0.1);
};

// --- HOOKS ---
LaporanHarianSchema.pre<ILaporanHarian>("save", function () {
  // Normalisasi Tanggal ke Jam 00:00 (Biar filter harian akurat)
  if (this.reportDate) {
    const date = new Date(this.reportDate);
    date.setHours(0, 0, 0, 0);
    this.reportDate = date;
  }
  calculateShares(this);
});

LaporanHarianSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate() as any;

  if (update.reportDate) {
    const d = new Date(update.reportDate);
    d.setHours(0, 0, 0, 0);
    update.reportDate = d;
  }

  // Jika revenue berubah, hitung ulang share
  if (update.totalRevenue !== undefined) {
    const rev = update.totalRevenue;
    update.ownerShare = Math.floor(rev * 0.5);
    update.employeeShare = Math.floor(rev * 0.4);
    update.managementShare = Math.floor(rev * 0.1);
  }
});

// --- VIRTUALS ---

// 1. Total Jajan Hari Ini
LaporanHarianSchema.virtual("totalManagementExpenses").get(function () {
  if (!this.managementExpenses) return 0;
  return this.managementExpenses.reduce(
    (sum: number, exp: IExpense) => sum + exp.amount,
    0,
  );
});

// 2. Sisa Jatah Management (Netto)
LaporanHarianSchema.virtual("managementNet").get(function () {
  return this.managementShare - (this as any).totalManagementExpenses;
});

// 3. Status Bocor (Defisit)
LaporanHarianSchema.virtual("isManagementDeficit").get(function () {
  return (this as any).managementNet < 0;
});

// 4. Estimasi Setoran Fisik (Paling Penting buat Audit)
LaporanHarianSchema.virtual("totalCashToDeposit").get(function () {
  // Cash yang dibawa = Omzet - Jajan yang dipotong di tempat
  return this.totalRevenue - (this as any).totalManagementExpenses;
});

// --- METHODS ---
LaporanHarianSchema.methods.addExpense = function (
  description: string,
  amount: number,
  userId: Types.ObjectId,
) {
  this.managementExpenses.push({
    description,
    amount: Math.round(amount),
    createdBy: userId,
    isVerified: true, // Auto-Verify
  });
};

// --- STATICS (AGGREGATION) ---
LaporanHarianSchema.statics.getMonthlySummary = async function (
  month: number,
  year: number,
  branchId?: string,
) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  let matchQuery: any = { reportDate: { $gte: start, $lte: end } };
  if (branchId) matchQuery.branch = new mongoose.Types.ObjectId(branchId);

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $project: {
        totalRevenue: 1,
        ownerShare: 1,
        employeeShare: 1,
        managementShare: 1,
        docExpense: { $sum: "$managementExpenses.amount" },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalRevenue" },
        totalOwner: { $sum: "$ownerShare" },
        totalEmployee: { $sum: "$employeeShare" },
        totalManagement: { $sum: "$managementShare" },
        totalExpenses: { $sum: "$docExpense" },
      },
    },
  ]);

  if (stats.length === 0) {
    return {
      totalRevenue: 0,
      totalOwner: 0,
      totalEmployee: 0,
      totalManagement: 0,
      totalExpenses: 0,
      managementNet: 0,
      totalCashToDeposit: 0,
    };
  }

  const s = stats[0];
  return {
    totalRevenue: s.totalRevenue,
    totalOwner: s.totalOwner,
    totalEmployee: s.totalEmployee,
    totalManagement: s.totalManagement,
    totalManagementExpenses: s.totalExpenses,
    managementNet: s.totalManagement - s.totalExpenses,
    totalCashToDeposit: s.totalRevenue - s.totalExpenses,
  };
};

// --- INDEXING ---
// Mencegah karyawan input double di hari & cabang yang sama
LaporanHarianSchema.index(
  { reportDate: 1, branch: 1, createdBy: 1 },
  { unique: true },
);

const LaporanHarianModel = mongoose.model<ILaporanHarian, ILaporanHarianModel>(
  "LaporanHarian",
  LaporanHarianSchema,
);

export default LaporanHarianModel;
