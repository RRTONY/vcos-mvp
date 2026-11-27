/** @type {import('next').NextConfig} */
// Old page addresses now live as tabs on /team - keep bookmarks and links working.
const TEAM_TABS = {
  '/escalations': 'attention',
  '/reports': 'reports',
  '/compliance': 'filing',
  '/kickoff': 'people',
  '/standup': 'daily',
  '/commitments': 'decisions',
}

// The Briefing Room is now the Command Centre (lib/workspace.ts). Old ?tab= ids
// map to the new tab addresses; keep in sync with CC_TABS.
const BRIEFING_TABS = {
  overview: 'overview',
  audit: 'email-audit',
  decisions: 'decisions',
  log: 'meeting-log',
  changes: 'what-changed',
  questions: 'questions',
  history: 'history',
}

const nextConfig = {
  async redirects() {
    return [
      ...Object.entries(TEAM_TABS).map(([source, tab]) => ({
        source,
        destination: `/team?tab=${tab}`,
        permanent: false,
      })),
      { source: '/projects', destination: '/team?tab=hours', permanent: false },
      ...Object.entries(BRIEFING_TABS).map(([tab, slug]) => ({
        source: '/briefing',
        has: [{ type: 'query', key: 'tab', value: tab }],
        destination: `/command-centre/${slug}`,
        permanent: true,
      })),
      { source: '/briefing', destination: '/command-centre/overview', permanent: true },
      { source: '/meeting-prep', destination: '/command-centre/overview', permanent: false },
      { source: '/workload', destination: '/team?tab=people', permanent: false },
      { source: '/openloops', destination: '/team?tab=people', permanent: false },
    ]
  },
}

module.exports = nextConfig
