import { Org, IOrg } from "@operium/db";

export class OrgRepository {
  async create(data: { name: string; slug: string; inviteCode: string }): Promise<IOrg> {
    return await Org.create(data);
  }

  async findById(id: string): Promise<IOrg | null> {
    return await Org.findById(id);
  }

  async findBySlug(slug: string): Promise<IOrg | null> {
    return await Org.findOne({ slug });
  }

  async findByInviteCode(inviteCode: string): Promise<IOrg | null> {
    return await Org.findOne({ inviteCode: inviteCode.toUpperCase() });
  }

  async updateInviteCode(orgId: string, inviteCode: string): Promise<IOrg | null> {
    return await Org.findByIdAndUpdate(orgId, { inviteCode }, { new: true });
  }
}

export const orgRepository = new OrgRepository();
