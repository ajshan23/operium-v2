import mongoose, { Document, Model, Schema } from "mongoose";

export interface ITeam extends Document {
  id: string;
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
}

const TeamSchema: Schema = new Schema({
  orgId: { type: Schema.Types.ObjectId, ref: "Org", required: true },
  name: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Best practice: Index by tenant ID
TeamSchema.index({ orgId: 1 });
TeamSchema.index({ orgId: 1, name: 1 }, { unique: true });

export const Team: Model<ITeam> =
  mongoose.models.Team || mongoose.model<ITeam>("Team", TeamSchema);
