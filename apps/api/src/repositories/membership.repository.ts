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
}

export const membershipRepository = new MembershipRepository();
