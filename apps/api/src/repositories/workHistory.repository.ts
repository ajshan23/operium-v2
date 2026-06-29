import mongoose from "mongoose";
import { WorkHistory, IWorkHistory } from "@operium/db";

export class WorkHistoryRepository {
  async find(filter: object, options: { skip: number; limit: number }) {
    return WorkHistory.find(filter)
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .lean();
  }

  async count(filter: object) {
    return WorkHistory.countDocuments(filter);
  }

  async findById(id: string, userId: string) {
    return WorkHistory.findOne({ _id: id, userId }).lean();
  }

  async create(data: Partial<IWorkHistory>) {
    const entry = new WorkHistory(data);
    return entry.save();
  }

  async updateById(id: string, userId: string, data: Partial<IWorkHistory>) {
    return WorkHistory.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true }
    ).lean();
  }

  async deleteById(id: string, userId: string) {
    return WorkHistory.deleteOne({ _id: id, userId });
  }

  async upsertByExternalId(userId: string, externalId: string, insertData: object, setData?: object) {
    return WorkHistory.updateOne(
      { userId: new mongoose.Types.ObjectId(userId), externalId },
      {
        $setOnInsert: insertData,
        ...(setData ? { $set: setData } : {}),
      },
      { upsert: true }
    );
  }

  async aggregateStats(userId: string, since: Date, tzOffsetMs: number) {
    return WorkHistory.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $subtract: ["$createdAt", tzOffsetMs] },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async findActiveItems(userId: string) {
    return WorkHistory.find({
      userId,
      $or: [
        { "metadata.prStatus": "active" },
        { isOngoing: true },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async deleteManyByExternalIdPrefix(userId: string, prefix: string) {
    return WorkHistory.deleteMany({
      userId,
      externalId: { $regex: `^${prefix}` },
    });
  }
}

export const workHistoryRepository = new WorkHistoryRepository();
