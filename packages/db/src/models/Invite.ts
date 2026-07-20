import mongoose, { Document, Model, Schema } from "mongoose";
import type { Role } from "./Membership.js";

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface IInvite extends Document {
  orgId:     mongoose.Types.ObjectId;
  email:     string;                       // lowercased; the invite is bound to this address
  role:      Role;                         // role granted on acceptance
  token:     string;                       // 256-bit unguessable secret, the accept credential
  status:    InviteStatus;
  invitedBy: mongoose.Types.ObjectId;
  expiresAt: Date;                         // pending invites past this are invalid
  acceptedBy?: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InviteSchema = new Schema<IInvite>(
  {
    orgId:     { type: Schema.Types.ObjectId, ref: "Org",  required: true, index: true },
    email:     { type: String, required: true, lowercase: true, trim: true },
    role:      { type: String, enum: ["owner", "admin", "member"], default: "member" },
    token:     { type: String, required: true, unique: true },
    status:    { type: String, enum: ["pending", "accepted", "revoked"], default: "pending", index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    acceptedBy:{ type: Schema.Types.ObjectId, ref: "User" },
    acceptedAt:{ type: Date },
  },
  { timestamps: true }
);

// One live invite per (org, email): a unique index over pending rows keeps
// re-inviting idempotent-ish and prevents pile-ups. Accepted/revoked rows are
// excluded so the same address can be re-invited later.
InviteSchema.index(
  { orgId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export const Invite: Model<IInvite> =
  mongoose.models.Invite || mongoose.model<IInvite>("Invite", InviteSchema);
