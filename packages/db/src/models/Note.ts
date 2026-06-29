import mongoose, { Document, Model, Schema } from "mongoose";

export interface INote extends Document {
  title:    string;
  type:     "text" | "canvas";
  preview?: string;
  spaceId:  mongoose.Types.ObjectId;
  userId:   mongoose.Types.ObjectId;
  tags:     string[];
  isStarred: boolean;
  isShared:  boolean;
  shareId?:  string;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    title:   { type: String, default: "" },
    type:    { type: String, enum: ["text", "canvas"], default: "text" },
    preview: { type: String, default: "" },
    spaceId: { type: Schema.Types.ObjectId, ref: "Space",  required: true },
    userId:  { type: Schema.Types.ObjectId, ref: "User",   required: true },
    tags:    [String],
    isStarred: { type: Boolean, default: false },
    isShared:  { type: Boolean, default: false },
    shareId:   { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

NoteSchema.index({ spaceId: 1, userId: 1 });
NoteSchema.index({ userId: 1, updatedAt: -1 });

export const Note: Model<INote> =
  mongoose.models.Note || mongoose.model<INote>("Note", NoteSchema);
