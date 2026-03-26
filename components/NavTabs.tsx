'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const TABS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Reports', href: '/reports' },
  { label: 'Submit Report', href: '/submit' },
  { label: 'Compliance', href: '/compliance' },
  { label: 'Invoices', href: '/invoices' },
  { label: 'Systems', href: '/systems' },
  { label: 'Open Loops', href: '/openloops' },
]

const ADMIN_TABS = [
  { label: 'BD Pipeline', href: '/bd' },
  { label: 'Users', href: '/settings/users' },
  { label: 'Requests', href: '/settings/requests' },
  { label: 'API Keys', href: '/settings/keys' },
]

export default function NavTabs() {
  const path = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => setIsAdmin(d?.role === 'admin'))
      .catch(() => {})
  }, [])

  const allTabs = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS

  return (
    <div className="flex border-b border-sand3 bg-sand overflow-x-auto sticky top-14 z-30">
      {allTabs.map((t) => {
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
