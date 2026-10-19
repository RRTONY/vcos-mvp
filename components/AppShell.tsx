'use client'

import { usePathname } from 'next/navigation'
import Topbar from './Topbar'
import NavTabs from './NavTabs'

const AUTH_PATHS = ['/login', '/signup']

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

  return (
    <>
      <Topbar />
      <NavTabs />
      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4">{children}</main>
    </>
  )
}
