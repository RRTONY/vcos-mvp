'use client'

import { usePathname } from 'next/navigation'
import Topbar from './Topbar'
import NavTabs from './NavTabs'

const AUTH_PATHS = ['/login', '/signup']
// Pages that fill the whole viewport under the nav (no centred content column)
const FULL_BLEED_PATHS = ['/briefing']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_PATHS.some(p => pathname.startsWith(p))

  if (isAuth) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center px-4 py-12">
        {children}
      </div>
    )
  }

  if (FULL_BLEED_PATHS.some(p => pathname.startsWith(p))) {
    return (
      <div className="flex flex-col h-[100dvh]">
        <Topbar />
        <NavTabs />
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    )
  }

  return (
    <>
      <Topbar />
      <NavTabs />
      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4">{children}</main>
    </>
  )
}
