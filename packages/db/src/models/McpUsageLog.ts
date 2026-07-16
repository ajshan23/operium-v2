import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMcpUsageLog extends Document {
  userId:        mongoose.Types.ObjectId;
  toolName:      string;
  success:       boolean;
  errorMessage?: string;
  durationMs:    number;
  createdAt:     Date;
}

const McpUsageLogSchema = new Schema<IMcpUsageLog>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    toolName:     { type: String, required: true, index: true },
    success:      { type: Boolean, required: true },
    errorMessage: { type: String },
    durationMs:   { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

McpUsageLogSchema.index({ createdAt: -1 });
McpUsageLogSchema.index({ userId: 1, createdAt: -1 });
// Logs are operational telemetry — expire after 90 days
McpUsageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const McpUsageLog: Model<IMcpUsageLog> =
  mongoose.models.McpUsageLog ||
  mongoose.model<IMcpUsageLog>("McpUsageLog", McpUsageLogSchema);
