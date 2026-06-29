import mongoose, { Document, Model, Schema } from "mongoose";

export interface ISpace extends Document {
  name: string;
  description?: string;
  userId: mongoose.Types.ObjectId;
  icon?: string;
  isSharedWithContext: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SpaceSchema = new Schema<ISpace>(
  {
    name: {
      type:     String,
      required: [true, "Name is required"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },
    description: {
      type:      String,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    icon:   { type: String, default: "folder" },
    isSharedWithContext: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SpaceSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Space: Model<ISpace> =
  mongoose.models.Space || mongoose.model<ISpace>("Space", SpaceSchema);
