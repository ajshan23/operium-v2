import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async (): Promise<void> => {
  if (isConnected) {
    return;
  }

  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not defined");
    }

    await mongoose.connect(uri);
    isConnected = true;
    console.log("🟢 Connected to MongoDB");
  } catch (error) {
    console.error("🔴 MongoDB connection error:", error);
    throw error;
  }
};

export * from "./models/User.js";
export * from "./models/Org.js";
export * from "./models/Team.js";
export * from "./models/Membership.js";
export * from "./models/OTP.js";
export * from "./models/WorkHistory.js";
export * from "./models/MyTask.js";
export * from "./models/Space.js";
export * from "./models/Note.js";
export * from "./models/NoteBlock.js";
export * from "./models/CoworkSession.js";
export * from "./models/CoworkChunk.js";
export * from "./models/ContextRule.js";
export * from "./models/Task.js";
