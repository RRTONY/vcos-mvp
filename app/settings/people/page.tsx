'use client'

// Unified "Team & Users" section — merges the former separate Team (roster) and
// Users (login accounts) pages into one place with two tabs.
import { useState } from 'react'
import TeamPanel from '@/app/settings/team/page'
import UsersPanel from '@/app/settings/users/page'

export default function PeoplePage() {
  const [tab, setTab] = useState<'team' | 'users'>('team')
  return (
    <div className="mt-6">
      <h1 className="font-display text-xl tracking-widest mb-3">TEAM &amp; USERS</h1>
      <div className="flex gap-1 border-b border-sand4 mb-2">
        {([['team', 'Team Members'], ['users', 'Login Users']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === k ? 'border-accent text-accent' : 'border-transparent text-ink3 hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className={tab === 'team' ? '' : 'hidden'}><TeamPanel /></div>
      <div className={tab === 'users' ? '' : 'hidden'}><UsersPanel /></div>
    </div>
  )
}
