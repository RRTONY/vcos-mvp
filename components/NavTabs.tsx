'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMe } from '@/hooks/useMe'

const TABS = [
  { label: 'Dashboard', href: '/' },
  { label: 'VCoS-AI', href: '/chatbot' },
  { label: 'Reports', href: '/reports' },
  { label: 'Submit Report', href: '/submit' },
  { label: 'Compliance', href: '/compliance' },
  { label: 'Invoices', href: '/invoices' },
  { label: 'BD Pipeline', href: '/bd' },
  { label: 'Systems', href: '/systems' },
  { label: 'Open Loops', href: '/openloops' },
]

const KICKOFF_TAB = { label: 'Performance', href: '/kickoff' }
const COMMIT_TAB = { label: 'Commitments', href: '/commitments' }
const WORKLOAD_TAB = { label: 'Workload', href: '/workload' }
const STANDUP_TAB = { label: 'Standup Log', href: '/standup' }
const ESCALATION_TAB = { label: 'Escalations', href: '/escalations' }

const ADMIN_TABS = [
  { label: 'Team & Users', href: '/settings/people' },
  { label: 'Requests', href: '/settings/requests' },
  { label: 'API Keys', href: '/settings/keys' },
]

export default function NavTabs() {
  const path = usePathname()
  const { isAdmin } = useMe()

  const allTabs = isAdmin ? [...TABS, KICKOFF_TAB, WORKLOAD_TAB, STANDUP_TAB, ESCALATION_TAB, COMMIT_TAB, ...ADMIN_TABS] : TABS

  return (
    <div className="flex border-b border-sand4 bg-sand overflow-x-auto sticky top-16 z-30">
      {allTabs.map((t) => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-ink3 hover:text-ink hover:border-sand4'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
