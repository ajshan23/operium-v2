import mongoose, { Document, Model, Schema } from "mongoose";

export type CoworkSource   = "antigravity" | "claude-code" | "cursor" | "system";
export type CoworkIntent   = "bug-fix" | "feature" | "refactor" | "investigation" | "planning" | "review" | "docs";
export type CoworkOutcome  = "fixed" | "implemented" | "explored" | "blocked" | "abandoned" | "partial";

/** One git repo touched during a session. A session may span several repos
 *  (or the same repo on several branches via worktrees). */
export interface ICoworkRepo {
  repoKey:       string;   // canonical "host/owner/repo" — match/join key
  repoUrl:       string;   // credential-stripped original URL
  repoName:      string;   // short display name ("operium")
  branch?:       string;
  commitSha?:    string;
  prUrl?:        string;
  filesTouched?: string[]; // paths scoped to this repo
}

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
  repos:           ICoworkRepo[];
  // Legacy single-repo fields — mirrored from repos[0] for back-compat
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
    repos: {
      type: [{
        repoKey:      { type: String, required: true },
        repoUrl:      { type: String, required: true },
        repoName:     { type: String, required: true },
        branch:       String,
        commitSha:    String,
        prUrl:        String,
        filesTouched: [String],
        _id: false,
      }],
      default: [],
    },
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
CoworkSessionSchema.index({ "repos.repoKey": 1, createdAt: -1 });
CoworkSessionSchema.index({ userId: 1, title: "text", summary: "text" });

export const CoworkSession: Model<ICoworkSession> =
  mongoose.models.CoworkSession ||
  mongoose.model<ICoworkSession>("CoworkSession", CoworkSessionSchema);
