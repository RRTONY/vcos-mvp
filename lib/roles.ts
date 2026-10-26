/** Managers (admin/owner) can see rates and act on behalf of anyone. */
export function isManager(role: string | null): boolean {
  return role === "admin" || role === "owner";
}
