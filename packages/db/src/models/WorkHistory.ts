import mongoose, { Document, Model, Schema } from "mongoose";

export type HistoryCategory =
  | "General" | "Meeting" | "PR Review" | "Daily Standup" | "Sales Meeting"
  | "Coding" | "Debugging" | "Design" | "Planning" | "Deployment" | "Wiki";

export type HistoryType = "simple" | "code" | "checklist";
export type HistorySource = "manual" | "git" | "pr" | "deploy" | "build" | "azure";

export interface IWorkHistory extends Document {
  userId: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: HistoryCategory;
  type: HistoryType;
  source: HistorySource;
  isMilestone: boolean;
  isBlocker: boolean;
  isImportant: boolean;
  isOngoing: boolean;
  codeSnippet?: { code: string; language: string; filename?: string };
  checklistItems?: Array<{ text: string; completed: boolean }>;
  externalId?: string;
  metadata?: {
    prLink?: string;
    prStatus?: string;
    prId?: string;
    /** The user's relationship to this PR: they opened it, or were a reviewer on it */
    role?: "author" | "reviewer";
    /** The user's own review vote (Azure: 10 approved, 5 approved w/ suggestions, 0 none, -5 waiting, -10 rejected) */
    myVote?: number;
    sourceBranch?: string;
    targetBranch?: string;
    reviewers?: Array<{ name: string; vote: number; isRequired: boolean }>;
    pushLink?: string;
    project?: string;
    repo?: string;
    repoId?: string;
    repoName?: string;
    isBuild?: boolean;
    buildLink?: string;
    result?: string;
    buildStatus?: string;
    contributors?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const WorkHistorySchema = new Schema<IWorkHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId:  { type: Schema.Types.ObjectId, ref: "Org",  index: true },
    title:  { type: String, required: true },
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: ["General","Meeting","PR Review","Daily Standup","Sales Meeting","Coding","Debugging","Design","Planning","Deployment","Wiki"],
      default: "General",
    },
    type:   { type: String, enum: ["simple","code","checklist"], default: "simple" },
    source: { type: String, enum: ["manual","git","pr","deploy","build","azure"], default: "manual" },
    isMilestone: { type: Boolean, default: false, index: true },
    isBlocker:   { type: Boolean, default: false, index: true },
    isImportant: { type: Boolean, default: false, index: true },
    isOngoing:   { type: Boolean, default: false },
    codeSnippet: {
      code:     String,
      language: { type: String, default: "text" },
      filename: String,
    },
    checklistItems: [{ text: String, completed: { type: Boolean, default: false } }],
    externalId: { type: String, sparse: true },
    metadata: {
      prLink:       String,
      prStatus:     String,
      prId:         String,
      role:         { type: String, enum: ["author", "reviewer"] },
      myVote:       Number,
      sourceBranch: String,
      targetBranch: String,
      reviewers:    [{ name: String, vote: Number, isRequired: Boolean }],
      pushLink:     String,
      project:      String,
      repo:         String,
      repoId:       String,
      repoName:     String,
      isBuild:      Boolean,
      buildLink:    String,
      result:       String,
      buildStatus:  String,
      contributors: [String],
    },
  },
  { timestamps: true }
);

WorkHistorySchema.index({ userId: 1, createdAt: -1 });
WorkHistorySchema.index({ orgId: 1, createdAt: -1 });
WorkHistorySchema.index({ userId: 1, externalId: 1 }, { sparse: true });
WorkHistorySchema.index({ userId: 1, title: "text", description: "text" });

export const WorkHistory: Model<IWorkHistory> =
  mongoose.models.WorkHistory ||
  mongoose.model<IWorkHistory>("WorkHistory", WorkHistorySchema);
