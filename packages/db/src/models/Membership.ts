import mongoose, { Document, Model, Schema } from "mongoose";

export type Role = "owner" | "admin" | "member";

export interface IMembership extends Document {
  id: string;
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  role: Role;
  createdAt: Date;
}

const MembershipSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  orgId: { type: Schema.Types.ObjectId, ref: "Org", required: true },
  teamId: { type: Schema.Types.ObjectId, ref: "Team" },
  role: { type: String, enum: ["owner", "admin", "member"], required: true },
  createdAt: { type: Date, default: Date.now },
});

// Best practice: Querying memberships by user or org
MembershipSchema.index({ userId: 1, orgId: 1 }, { unique: true });
MembershipSchema.index({ orgId: 1 });

export const Membership: Model<IMembership> =
  mongoose.models.Membership || mongoose.model<IMembership>("Membership", MembershipSchema);
