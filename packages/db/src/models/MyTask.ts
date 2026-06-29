import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMyTask extends Document {
  userId: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId;
  externalId: string;
  title: string;
  state: string;
  type: string;
  project: string;
  url: string;
  metadata?: { wiId?: number };
  createdAt: Date;
  updatedAt: Date;
}

const MyTaskSchema = new Schema<IMyTask>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId:      { type: Schema.Types.ObjectId, ref: "Org",  index: true },
    externalId: { type: String, required: true },
    title:      { type: String, required: true },
    state:      { type: String, default: "Active" },
    type:       { type: String, default: "Task" },
    project:    { type: String, required: true },
    url:        { type: String, default: "" },
    metadata:   { wiId: Number },
  },
  { timestamps: true }
);

MyTaskSchema.index({ userId: 1, externalId: 1 }, { unique: true });

export const MyTask: Model<IMyTask> =
  mongoose.models.MyTask || mongoose.model<IMyTask>("MyTask", MyTaskSchema);
