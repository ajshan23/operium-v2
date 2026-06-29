import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICoworkChunk extends Document {
  sessionId:      mongoose.Types.ObjectId;
  userId:         mongoose.Types.ObjectId;
  isShared:       boolean;
  order:          number;
  text:           string;
  sessionTitle:   string;
  sessionSource:  string;
  sessionIntent?: string;
  sessionOutcome?:string;
  embedding?:     number[];
  embeddingDirty: boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const CoworkChunkSchema = new Schema<ICoworkChunk>(
  {
    sessionId:     { type: Schema.Types.ObjectId, ref: "CoworkSession", required: true, index: true },
    userId:        { type: Schema.Types.ObjectId, ref: "User",          required: true, index: true },
    isShared:      { type: Boolean, default: true, index: true },
    order:         { type: Number, required: true },
    text:          { type: String, required: true },
    sessionTitle:  { type: String, required: true },
    sessionSource: { type: String, required: true },
    sessionIntent:  { type: String, index: true },
    sessionOutcome: { type: String, index: true },
    embedding:      { type: [Number], default: undefined },
    embeddingDirty: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CoworkChunkSchema.index({ sessionId: 1, order: 1 });

export const CoworkChunk: Model<ICoworkChunk> =
  mongoose.models.CoworkChunk ||
  mongoose.model<ICoworkChunk>("CoworkChunk", CoworkChunkSchema);
