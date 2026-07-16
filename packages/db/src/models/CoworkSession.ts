import mongoose, { Document, Model, Schema } from "mongoose";

export type CoworkSource   = "antigravity" | "claude-code" | "cursor" | "system";
export type CoworkIntent   = "bug-fix" | "feature" | "refactor" | "investigation" | "planning" | "review" | "docs";
export type CoworkOutcome  = "fixed" | "implemented" | "explored" | "blocked" | "abandoned" | "partial";

export interface ICoworkSession extends Document {
  userId:          mongoose.Types.ObjectId;
  orgId?:          mongoose.Types.ObjectId;
  source:          CoworkSource;
  title:           string;
  summary:         string;
  tags:            string[];
  isShared:        boolean;
  intent?:         CoworkIntent;
  outcome?:        CoworkOutcome;
  filesTouched?:   string[];
  languages?:      string[];
  branch?:         string;
  commitSha?:      string;
  repoUrl?:        string;
  prUrl?:          string;
  useCount:        number;
  helpfulCount:    number;
  notHelpfulCount: number;
  lastUsedAt?:     Date;
  createdAt:       Date;
  updatedAt:       Date;
}

const CoworkSessionSchema = new Schema<ICoworkSession>(
  {
    userId:  { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId:   { type: Schema.Types.ObjectId, ref: "Org", index: true },
    source:  { type: String, enum: ["antigravity","claude-code","cursor","system"], required: true },
    title:   { type: String, required: true },
    summary: { type: String, required: true, default: "" },
    tags:    { type: [String], default: [], index: true },
    isShared: { type: Boolean, default: true, index: true },
    intent:   { type: String, enum: ["bug-fix","feature","refactor","investigation","planning","review","docs"], index: true },
    outcome:  { type: String, enum: ["fixed","implemented","explored","blocked","abandoned","partial"], index: true },
    filesTouched: [String],
    languages:    [String],
    branch:    String,
    commitSha: String,
    repoUrl:   String,
    prUrl:     String,
    useCount:        { type: Number, default: 0 },
    helpfulCount:    { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
    lastUsedAt: Date,
  },
  { timestamps: true }
);

CoworkSessionSchema.index({ userId: 1, createdAt: -1 });
CoworkSessionSchema.index({ userId: 1, title: "text", summary: "text" });

export const CoworkSession: Model<ICoworkSession> =
  mongoose.models.CoworkSession ||
  mongoose.model<ICoworkSession>("CoworkSession", CoworkSessionSchema);
