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

const nextConfig = {
  async redirects() {
    return [
      ...Object.entries(TEAM_TABS).map(([source, tab]) => ({
        source,
        destination: `/team?tab=${tab}`,
        permanent: false,
      })),
      { source: '/projects', destination: '/team?tab=hours', permanent: false },
      { source: '/meeting-prep', destination: '/briefing', permanent: false },
      { source: '/workload', destination: '/team?tab=people', permanent: false },
      { source: '/openloops', destination: '/team?tab=people', permanent: false },
    ]
  },
}

module.exports = nextConfig
