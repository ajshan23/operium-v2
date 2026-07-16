const ORG_KEY = "operium_org_id";

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_KEY);
}

export function setActiveOrgId(orgId: string): void {
  localStorage.setItem(ORG_KEY, orgId);
}

export function removeActiveOrgId(): void {
  localStorage.removeItem(ORG_KEY);
}
