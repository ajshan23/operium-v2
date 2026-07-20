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
    // MongoDB rejects an update where the same path (or an ancestor of a
    // dotted path, e.g. `metadata` vs `metadata.prStatus`) appears in both
    // $setOnInsert and $set. Resolve overlaps in favour of $set — it applies
    // on insert too — expanding conflicting object roots one level so the
    // non-conflicting subfields still land on first insert.
    const setPaths = new Set(Object.keys(setData ?? {}));
    const setRoots = new Set([...setPaths].map(p => p.split(".")[0]));

    const setOnInsert: Record<string, any> = {};
    for (const [key, value] of Object.entries(insertData)) {
      if (!setRoots.has(key)) { setOnInsert[key] = value; continue; }
      if (setPaths.has(key)) continue; // exact overlap — $set wins
      if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        for (const [sub, subValue] of Object.entries(value)) {
          const path = `${key}.${sub}`;
          if (!setPaths.has(path)) setOnInsert[path] = subValue;
        }
      }
      // conflicting non-object values are covered by $set — nothing to keep
    }

    return WorkHistory.updateOne(
      { userId: new mongoose.Types.ObjectId(userId), externalId },
      {
        ...(Object.keys(setOnInsert).length ? { $setOnInsert: setOnInsert } : {}),
        ...(setData && setPaths.size ? { $set: setData } : {}),
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
