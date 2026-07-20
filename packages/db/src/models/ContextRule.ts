import mongoose, { Document, Model, Schema } from "mongoose";

export type RuleCategory = "coding" | "communication" | "workflow" | "architecture" | "testing" | "general";
export type RuleScope    = "personal" | "team";

export interface IContextRule extends Document {
  userId:       mongoose.Types.ObjectId;
  orgId?:       mongoose.Types.ObjectId;
  title:        string;
  rule:         string;
  category:     RuleCategory;
  /** "personal" = author only; "team" = every member of orgId sees it. */
  scope:        RuleScope;
  tags:         string[];
  /** Canonical repo keys this rule applies to; empty/absent = global. */
  repoKeys?:    string[];
  isActive:     boolean;
  source:       "manual" | "learned";
  timesApplied: number;
  createdAt:    Date;
  updatedAt:    Date;
}

const ContextRuleSchema = new Schema<IContextRule>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orgId:    { type: Schema.Types.ObjectId, ref: "Org",  index: true },
    title:    { type: String, required: true },
    rule:     { type: String, required: true },
    category: {
      type: String,
      enum: ["coding","communication","workflow","architecture","testing","general"],
      default: "general",
    },
    scope:        { type: String, enum: ["personal","team"], default: "personal", index: true },
    tags:         { type: [String], default: [] },
    repoKeys:     { type: [String], default: undefined, index: true },
    isActive:     { type: Boolean, default: true, index: true },
    source:       { type: String, enum: ["manual","learned"], default: "manual" },
    timesApplied: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ContextRuleSchema.index({ userId: 1, isActive: 1 });
ContextRuleSchema.index({ userId: 1, category: 1 });
ContextRuleSchema.index({ orgId: 1, scope: 1, isActive: 1 });

export const ContextRule: Model<IContextRule> =
  mongoose.models.ContextRule || mongoose.model<IContextRule>("ContextRule", ContextRuleSchema);
