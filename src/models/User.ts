// src/models/User.ts

import { Schema, model, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  username: string;
  fullname: string;
  email?: string;
  password: string;
  avatar: string;
  role: "owner" | "karyawan";
  branchLocations: Schema.Types.ObjectId[];
  googleId: "local" | "google";
  authMethod: string;
  createdAt?: Date;
  updateAt?: Date;
}

export interface IUserMethods {
  comparePassword(enteredPassword: string): Promise<boolean>;
}

export type UserDocument = IUser & Document & IUserMethods;

const userSchema = new Schema<UserDocument>(
  {
    username: { type: String, required: true },
    fullname: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: {
      type: String,
      required: [true, "Password Minimal 8 Karakter"],
      minlength: 8,
    },
    avatar: { type: String, default: "" },
    role: { type: String, enum: ["owner", "karyawan"], required: true },
    branchLocations: [{ type: Schema.Types.ObjectId, ref: "BranchLocations" }],
    googleId: { type: String },
    authMethod: { type: String, default: "local" },
  },
  {
    timestamps: true, // FIXED: createdAt & updatedAt otomatis ada, gak usah manual, BGSddd!
  },
);

userSchema.pre("validate", async function () {
  if (this.role === "karyawan") {
    if (!this.branchLocations || this.branchLocations.length === 0) {
      throw new Error("Minimal Isi Tempat Kerja Elu Lah bre!");
    }
  }
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const UserModel = model<UserDocument>("User", userSchema);

export default UserModel;
