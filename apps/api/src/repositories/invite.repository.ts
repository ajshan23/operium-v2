import { Invite, IInvite, Role } from "@operium/db";

export class InviteRepository {
  async create(data: {
    orgId: string; email: string; role: Role; token: string; invitedBy: string; expiresAt: Date;
  }): Promise<IInvite> {
    return await Invite.create(data);
  }

  async findByToken(token: string): Promise<IInvite | null> {
    return await Invite.findOne({ token });
  }

  async findPendingByOrgAndEmail(orgId: string, email: string): Promise<IInvite | null> {
    return await Invite.findOne({ orgId, email: email.toLowerCase().trim(), status: "pending" });
  }

  async listPendingByOrg(orgId: string): Promise<IInvite[]> {
    return await Invite.find({ orgId, status: "pending" })
      .sort({ createdAt: -1 })
      .populate("invitedBy", "name email")
      .lean() as unknown as IInvite[];
  }

  async findByIdAndOrg(inviteId: string, orgId: string): Promise<IInvite | null> {
    return await Invite.findOne({ _id: inviteId, orgId });
  }
}

export const inviteRepository = new InviteRepository();
