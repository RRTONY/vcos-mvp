// Shared report templates — the one-click reports VCoS-AI can generate.
// Centralized here so the chat suggestions (and any future "Reports" menu) all
// use the same prompts, and every report comes out in the same standard format
// (see the REPORT FORMAT section in lib/vcos-brain.ts) with the same export style.

export interface ReportTemplate {
  id: string
  label: string
  admin?: boolean        // team-wide reports — offered to admins only
  prompt: string
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  { id: 'gm',      label: 'Morning brief',     prompt: 'Run /gm — my morning brief for today, as a report.' },
  { id: 'mytasks', label: 'My open tasks',     prompt: 'Create a report of all my open tasks grouped by Overdue / Due Today / Due This Week, with a summary table of counts. I will download it.' },
  { id: 'prep',    label: 'Meeting prep',      prompt: 'Run /prep — a meeting-prep report on my most recent meeting: context, what was discussed, open items, their ask, my ask.' },
  { id: 'team',    label: 'Team pulse',        admin: true, prompt: 'Run /team — a team pulse report: weekly-report audit, missing reports, overdue/urgent by person (table), and escalation items.' },
  { id: 'deals',   label: 'Pipeline sweep',    admin: true, prompt: 'Run /deals — a pipeline report: status per active deal by close probability, threads gone cold, and the next action for each.' },
  { id: 'overdue', label: "Who's overdue?",    admin: true, prompt: 'Create a report of who has overdue tasks right now, with a per-person table and the most urgent items.' },
  { id: 'exec',    label: 'Weekly exec brief', admin: true, prompt: 'Write the weekly executive brief — wins, risks, and what needs Tony — as a one-page report. I will download it.' },
]
