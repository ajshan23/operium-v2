import mongoose, { Document, Model, Schema } from "mongoose";

export interface INoteBlock extends Document {
  noteId:  mongoose.Types.ObjectId;
  spaceId: mongoose.Types.ObjectId;
  userId:  mongoose.Types.ObjectId;
  order:   number;
  content: string;
  /** Semantic-search embedding, generated with the owner's Gemini key. */
  embedding?:        number[];
  embeddingDirty:    boolean;
  embeddingAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const NoteBlockSchema = new Schema<INoteBlock>(
  {
    noteId:  { type: Schema.Types.ObjectId, ref: "Note",  required: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "Space", required: true },
    userId:  { type: Schema.Types.ObjectId, ref: "User",  required: true },
    order:   { type: Number, required: true },
    content: { type: String, default: "" },
    embedding:         { type: [Number], default: undefined },
    embeddingDirty:    { type: Boolean, default: true },
    embeddingAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

NoteBlockSchema.index({ noteId: 1, order: 1 });
NoteBlockSchema.index({ embeddingDirty: 1, createdAt: 1 });

export const NoteBlock: Model<INoteBlock> =
  mongoose.models.NoteBlock ||
  mongoose.model<INoteBlock>("NoteBlock", NoteBlockSchema);
