import mongoose, { Document, Model, Schema } from "mongoose";

export interface IOrg extends Document {
  id: string;
  name: string;
  slug: string;
  inviteCode: string;
  createdAt: Date;
}

const OrgSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  inviteCode: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});


export const Org: Model<IOrg> =
  mongoose.models.Org || mongoose.model<IOrg>("Org", OrgSchema);
