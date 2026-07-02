// Fuzzy-match a ClickUp assignee key against a stats/avatar/task map — keys
// aren't exact (e.g. cuKey "kim" vs ClickUp username "kim.smith"), so this
// does a substring match in either direction.
export function lookupByAssignee<T>(map: Record<string, T> | undefined, key: string): T | null {
  if (!map || !key) return null
  const k = Object.keys(map).find(x => x.includes(key))
  return k ? map[k] : null
}
