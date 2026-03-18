'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Reports', href: '/reports' },
  { label: 'Submit Report', href: '/submit' },
  { label: 'Compliance', href: '/compliance' },
  { label: 'Systems', href: '/systems' },
  { label: 'Open Loops', href: '/openloops' },
]

export default function NavTabs() {
  const path = usePathname()
  return (
    <div className="flex border-b border-sand3 bg-sand overflow-x-auto sticky top-14 z-30">
      {TABS.map((t) => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${
              active
                ? 'border-ink text-ink'
                : 'border-transparent text-ink4 hover:text-ink3'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
