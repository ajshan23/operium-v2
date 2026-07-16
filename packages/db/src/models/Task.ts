import mongoose, { Document, Model, Schema } from "mongoose";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ITask extends Document {
  userId:      mongoose.Types.ObjectId;
  orgId?:      mongoose.Types.ObjectId;
  assigneeId?: mongoose.Types.ObjectId;
  title:       string;
  description?: string;
  status:      TaskStatus;
  priority:    TaskPriority;
  dueDate?:    Date;
  tags:        string[];
  completedAt?: Date;
  createdAt:   Date;
  updatedAt:   Date;
}

const TaskSchema = new Schema<ITask>(
  {
    userId:      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId:       { type: Schema.Types.ObjectId, ref: "Org", index: true },
    assigneeId:  { type: Schema.Types.ObjectId, ref: "User", index: true },
    title:       { type: String, required: true },
    description: { type: String, default: "" },
    status:      { type: String, enum: ["todo","in_progress","done","cancelled"], default: "todo", index: true },
    priority:    { type: String, enum: ["low","medium","high","urgent"], default: "medium" },
    dueDate:     Date,
    tags:        { type: [String], default: [] },
    completedAt: Date,
  },
  { timestamps: true }
);

TaskSchema.index({ userId: 1, status: 1 });
TaskSchema.index({ orgId: 1, status: 1 });
TaskSchema.index({ userId: 1, createdAt: -1 });

export const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);
