import type { Metadata } from 'next'
import './globals.css'
import Topbar from '@/components/Topbar'
import NavTabs from '@/components/NavTabs'
import { ToastProvider } from '@/components/Toast'
import { RefreshProvider } from '@/components/RefreshContext'

export const metadata: Metadata = {
  title: 'Visual Chief of Staff · RampRate / ImpactSoul',
  description: 'Real-time command center for RampRate and ImpactSoul operations',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RefreshProvider>
          <ToastProvider>
            <Topbar />
            <NavTabs />
            <main className="max-w-4xl mx-auto px-4 pb-16">{children}</main>
          </ToastProvider>
        </RefreshProvider>
      </body>
    </html>
  )
}
