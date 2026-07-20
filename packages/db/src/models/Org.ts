import mongoose, { Document, Model, Schema } from "mongoose";

export interface IOrg extends Document {
  id: string;
  name: string;
  slug: string;
  /** @deprecated Shared-code joins were removed in favor of per-email invites
   *  (see the Invite model). Still generated at creation to satisfy the legacy
   *  unique index, but never exposed to clients and never accepted for joining. */
  inviteCode: string;
  createdAt: Date;
}

const OrgSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  inviteCode: { type: String, required: true, unique: true, select: false },
  createdAt: { type: Date, default: Date.now },
});


export const Org: Model<IOrg> =
  mongoose.models.Org || mongoose.model<IOrg>("Org", OrgSchema);
