import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICustomIntegration {
  name: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  mapping?: {
    arrayPath?: string;
    titlePath?: string;
    descriptionPath?: string;
    datePath?: string;
    category?: string;
  };
}

export interface IUser extends Document {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  passwordHash?: string;
  authProvider: "email" | "google" | "github";
  githubId?: string;
  googleId?: string;
  isSuperUser: boolean;
  isBlocked: boolean;
  isVerified: boolean;
  // Integration tokens (excluded from default queries)
  githubToken?: string;
  azureDevOpsToken?: string;
  azureDevOpsOrg?: string;
  // Sync state
  githubLastSync?: Date;
  azureLastSync?: Date;
  githubFullSyncCompleted?: boolean;
  azureFullSyncCompleted?: boolean;
  azureFullSyncDate?: Date;
  // AI
  geminiApiKey?: string;
  // Preferences
  preferences?: { editWindowHours: number; shareCoworkByDefault: boolean };
  /** Per-repo cowork sharing overrides. A session is shared only if every repo
   *  it touches is shared (unlisted repos fall back to preferences.shareCoworkByDefault). */
  coworkRepoPrefs?: { repoKey: string; shared: boolean }[];
  customIntegrations?: ICustomIntegration[];
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  email:        { type: String, required: true, unique: true },
  name:         { type: String },
  avatar:       { type: String },
  passwordHash: { type: String },
  authProvider: {
    type: String,
    enum: ["email", "google", "github"],
    default: "email",
    required: true,
  },
  githubId:  { type: String, unique: true, sparse: true },
  googleId:  { type: String, unique: true, sparse: true },
  isSuperUser: { type: Boolean, default: false },
  isBlocked:   { type: Boolean, default: false },
  isVerified:  { type: Boolean, default: false },

  // Integration tokens — excluded from default selects
  githubToken:      { type: String, select: false },
  azureDevOpsToken: { type: String, select: false },
  azureDevOpsOrg:   { type: String },

  // Sync timestamps / flags
  githubLastSync:          { type: Date },
  azureLastSync:           { type: Date },
  githubFullSyncCompleted: { type: Boolean, default: false },
  azureFullSyncCompleted:  { type: Boolean, default: false },
  azureFullSyncDate:       { type: Date },

  // AI integration
  geminiApiKey: { type: String, select: false },

  // User preferences
  preferences: {
    editWindowHours: { type: Number, default: 48 },
    // When true (default), cowork sessions this user saves are visible to
    // their whole org. When false, saves default to private (owner-only).
    shareCoworkByDefault: { type: Boolean, default: true },
  },

  // Per-repo cowork sharing overrides (repoKey → shared). Absent = use the
  // shareCoworkByDefault above. Lets a dev keep some projects private.
  coworkRepoPrefs: {
    type: [{ repoKey: { type: String, required: true }, shared: { type: Boolean, required: true }, _id: false }],
    default: undefined,
  },

  // Custom webhook integrations
  customIntegrations: [
    {
      name:    String,
      url:     String,
      method:  { type: String, default: "GET" },
      headers: { type: Map, of: String },
      body:    String,
      mapping: {
        arrayPath:       String,
        titlePath:       String,
        descriptionPath: String,
        datePath:        String,
        category:        String,
      },
    },
  ],

  createdAt: { type: Date, default: Date.now },
});

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
