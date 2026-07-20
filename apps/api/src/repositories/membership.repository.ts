import { Membership, IMembership, Role } from "@operium/db";

export class MembershipRepository {
  async create(data: { userId: string; orgId: string; role: Role }): Promise<IMembership> {
    return await Membership.create(data);
  }

  async findByUserId(userId: string): Promise<IMembership[]> {
    return await Membership.find({ userId }).populate("orgId");
  }

  async findByOrgAndUser(orgId: string, userId: string): Promise<IMembership | null> {
    return await Membership.findOne({ orgId, userId });
  }

  async findByOrgId(orgId: string): Promise<IMembership[]> {
    return await Membership.find({ orgId }).populate("userId", "name email avatar");
  }

  async deleteByOrgAndUser(orgId: string, userId: string): Promise<boolean> {
    const res = await Membership.deleteOne({ orgId, userId });
    return res.deletedCount > 0;
  }

  async countByOrgAndRole(orgId: string, role: Role): Promise<number> {
    return await Membership.countDocuments({ orgId, role });
  }

  async countByUser(userId: string): Promise<number> {
    return await Membership.countDocuments({ userId });
  }

  async updateRole(orgId: string, userId: string, role: Role): Promise<void> {
    await Membership.updateOne({ orgId, userId }, { role });
  }
}

export const membershipRepository = new MembershipRepository();
