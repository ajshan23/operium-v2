/** Personal task access shared by REST, MCP, and summary readers.
 * An assigned task belongs to its assignee, not everyone in the organization.
 * Unassigned/legacy tasks remain accessible to their creator.
 */
export function personalTaskOwner(userId: string) {
  return { $or: [{ assigneeId: userId }, { assigneeId: null, userId }] };
}

export function personalTaskScope(userId: string, orgId?: string | null) {
  return {
    $and: [
      orgId
        ? { $or: [{ orgId }, { orgId: null, userId }] }
        : { orgId: null },
      personalTaskOwner(userId),
    ],
  };
}
