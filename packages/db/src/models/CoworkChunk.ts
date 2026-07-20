import mongoose, { Document, Model, Schema } from "mongoose";

export type CoworkChunkKind = "checkpoint" | "summary";

export interface ICoworkChunk extends Document {
  sessionId:      mongoose.Types.ObjectId;
  userId:         mongoose.Types.ObjectId;
  orgId?:         mongoose.Types.ObjectId;
  isShared:       boolean;
  kind:           CoworkChunkKind;
  order:          number;
  text:           string;
  sessionTitle:   string;
  sessionSource:  string;
  sessionIntent?: string;
  sessionOutcome?:string;
  /** Denormalized from the session's repos[] so recall can boost/filter
   *  by repo without a join. */
  repoKeys?:      string[];
  embedding?:     number[];
  embeddingDirty: boolean;
  embeddingAttempts: number;
  createdAt:      Date;
  updatedAt:      Date;
}

const CoworkChunkSchema = new Schema<ICoworkChunk>(
  {
    sessionId:     { type: Schema.Types.ObjectId, ref: "CoworkSession", required: true, index: true },
    userId:        { type: Schema.Types.ObjectId, ref: "User",          required: true, index: true },
    orgId:         { type: Schema.Types.ObjectId, ref: "Org", index: true },
    isShared:      { type: Boolean, default: true, index: true },
    kind:          { type: String, enum: ["checkpoint", "summary"], default: "checkpoint", index: true },
    order:         { type: Number, required: true },
    text:          { type: String, required: true },
    sessionTitle:  { type: String, required: true },
    sessionSource: { type: String, required: true },
    sessionIntent:  { type: String, index: true },
    sessionOutcome: { type: String, index: true },
    repoKeys:       { type: [String], default: undefined, index: true },
    embedding:      { type: [Number], default: undefined },
    embeddingDirty: { type: Boolean, default: true },
    embeddingAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CoworkChunkSchema.index({ sessionId: 1, order: 1 });
CoworkChunkSchema.index({ embeddingDirty: 1, createdAt: 1 });
// Keyword fallback for users without embeddings
CoworkChunkSchema.index({ text: "text", sessionTitle: "text" });

export const CoworkChunk: Model<ICoworkChunk> =
  mongoose.models.CoworkChunk ||
  mongoose.model<ICoworkChunk>("CoworkChunk", CoworkChunkSchema);
