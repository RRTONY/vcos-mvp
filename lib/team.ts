export interface TeamMember {
  name: string           // full display name
  cuKey: string          // ClickUp assignee key prefix for fuzzy matching
  slackAliases: string[] // lowercase aliases for Slack report matching
  role: string           // role description shown on dashboard
  billsHours: boolean    // appears in weekly report hours form
  filesReport: boolean   // expected to file weekly Slack report
}

export const TEAM: TeamMember[] = [
  { name: 'Rob Holmes',    cuKey: 'rob',    slackAliases: ['rob holmes', 'rob'],                          role: 'BD · Grants',           billsHours: true,  filesReport: true  },
  { name: 'Alex Veytsel',  cuKey: 'alex',   slackAliases: ['alex veytsel', 'alex'],                       role: 'Equity Partner',         billsHours: true,  filesReport: true  },
  { name: 'Josh Bykowski',  cuKey: 'josh',   slackAliases: ['josh bykowski', 'josh'],                      role: 'Legal · BD',             billsHours: true,  filesReport: true  },
  { name: 'Kim',           cuKey: 'kim',    slackAliases: ['kimberly dofredo', 'kimberly', 'kim'],        role: 'Executive Ops',          billsHours: true,  filesReport: true  },
  { name: 'Chase',         cuKey: 'chase',  slackAliases: ['chase adrian', 'chase'],                      role: 'Executive Ops',          billsHours: true,  filesReport: true  },
  { name: 'Daniel Baez',   cuKey: 'daniel', slackAliases: ['daniel baez', 'daniel'],                      role: 'Webmaster',              billsHours: true,  filesReport: true  },
  { name: 'Ben Sheppard',  cuKey: 'ben',    slackAliases: ['ben sheppard', 'ben'],                        role: 'ImpactSoul Contractor',  billsHours: true,  filesReport: true  },
  { name: 'Tony',          cuKey: 'tony',   slackAliases: ['tony greenberg', 'rampratetony', 'tonyg', 'tony'], role: 'CEO',            billsHours: false, filesReport: false },
]

export const TEAM_NAMES   = TEAM.map(m => m.name)
export const HOURS_MEMBERS = TEAM.filter(m => m.billsHours).map(m => m.name)
export const REPORT_MEMBERS = TEAM.filter(m => m.filesReport).map(m => m.name)

// Slack name → alias array map for report matching
export const SLACK_MATCH: Record<string, string[]> = Object.fromEntries(
  TEAM.map(m => [m.name, m.slackAliases])
)
