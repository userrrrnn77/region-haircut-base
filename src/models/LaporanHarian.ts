// src/models/LaporanHarian.ts

import mongoose, { Schema, Document, Types, Model } from "mongoose";

interface IExpense {
  description: string; // misal "listrik", "air", dll
  amount: number;
}

export interface ILaporanHarian extends Document {
  reportDate: Date;
  totalRevenue: number;
  branch: Types.ObjectId;
  ownerShare: number; // 50%
  employeeShare: number; // 40%
  managementShare: number; // 10%
  managementExpenses: IExpense[];
  createdBy?: Types.ObjectId;
  notes?: string;

  // Virtuals
  totalManagementExpenses: number;
  managementNet: number;
  isManagementDeficit: boolean;

  // Methods
  addExpense(description: string, amount: number): void;
}

// Interface untuk static methods
interface ILaporanHarianModel extends Model<ILaporanHarian> {
  getMonthlySummary(
    month: number,
    year: number,
  ): Promise<{
    totalOwner: number;
    totalEmployee: number;
    totalManagement: number;
    totalManagementExpenses: number;
    managementNet: number;
  }>;
}

// Expense sub-schema
const ExpenseSchema = new Schema<IExpense>(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// LaporanHarian schema
const LaporanHarianSchema = new Schema<ILaporanHarian>(
  {
    reportDate: { type: Date, required: true },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "BranchLocations",
      required: true,
    },
    totalRevenue: { type: Number, required: true },
    ownerShare: { type: Number, required: true },
    employeeShare: { type: Number, required: true },
    managementShare: { type: Number, required: true },
    managementExpenses: [ExpenseSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

// Pre-save hook: truncate date & hitung share otomatis
LaporanHarianSchema.pre<ILaporanHarian>("save", function () {
  const date = new Date(this.reportDate);
  date.setHours(0, 0, 0, 0);
  this.reportDate = date;

  this.ownerShare = Math.round(this.totalRevenue * 0.5);
  this.employeeShare = Math.round(this.totalRevenue * 0.4);
  this.managementShare = Math.round(this.totalRevenue * 0.1);
});

// Virtual: total pengeluaran management
LaporanHarianSchema.virtual("totalManagementExpenses").get(function () {
  return this.managementExpenses.reduce(
    (sum: number, exp: IExpense) => sum + Math.round(exp.amount),
    0,
  );
});

// Virtual: management net setelah pengeluaran
LaporanHarianSchema.virtual("managementNet").get(function () {
  return this.managementShare - this.totalManagementExpenses;
});

// Virtual: cek rugi management
LaporanHarianSchema.virtual("isManagementDeficit").get(function () {
  return this.managementNet < 0;
});

// Method: tambah pengeluaran management
LaporanHarianSchema.methods.addExpense = function (
  description: string,
  amount: number,
) {
  if (!this.managementExpenses) this.managementExpenses = [];
  this.managementExpenses.push({ description, amount: Math.round(amount) });
};

// Static method: summary bulanan
LaporanHarianSchema.statics.getMonthlySummary = async function (
  month: number,
  year: number,
) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const reports = await this.find({ reportDate: { $gte: start, $lte: end } });

  const summary = reports.reduce(
    (
      acc: {
        totalOwner: number;
        totalEmployee: number;
        totalManagement: number;
        totalManagementExpenses: number;
      },
      report: ILaporanHarian,
    ) => {
      acc.totalOwner += report.ownerShare;
      acc.totalEmployee += report.employeeShare;
      acc.totalManagement += report.managementShare;
      acc.totalManagementExpenses += report.totalManagementExpenses;
      return acc;
    },
    {
      totalOwner: 0,
      totalEmployee: 0,
      totalManagement: 0,
      totalManagementExpenses: 0,
    },
  );

  // Round semua total bulanan
  summary.totalOwner = Math.round(summary.totalOwner);
  summary.totalEmployee = Math.round(summary.totalEmployee);
  summary.totalManagement = Math.round(summary.totalManagement);
  summary.totalManagementExpenses = Math.round(summary.totalManagementExpenses);
  summary.managementNet = Math.round(
    summary.totalManagement - summary.totalManagementExpenses,
  );

  return summary;
};

LaporanHarianSchema.index(
  { reportDate: 1, branch: 1, createdBy: 1 },
  { unique: true },
);

const LaporanHarianModel = mongoose.model<ILaporanHarian, ILaporanHarianModel>(
  "LaporanHarian",
  LaporanHarianSchema,
);

export default LaporanHarianModel;

// ==========
// CARA PAKAI
// ==========
// const report = await LaporanHarianModel.findOne({ reportDate: new Date("2026-03-07") });
// report.addExpense("listrik", 200000);
// report.addExpense("air", 50000);
// await report.save();
