'use client'

import { useState } from 'react'
import type { Meeting } from '@/lib/types'
import FormattedNotes from '@/components/FormattedNotes'

const AVATAR_COLORS = ['#4F46E5','#7C3AED','#0891B2','#059669','#D97706','#DC2626']

function emailInitials(email: string) {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/)
  return parts.map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}


function MeetingItem({ m, isLast }: { m: Meeting; isLast: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-3 h-3 rounded-full bg-accent mt-1 flex-shrink-0 ring-2 ring-accent-light" />
        {!isLast && <div className="w-px flex-1 bg-sand4 mt-1" />}
      </div>

      {/* Content */}
      <div className={`pb-6 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full text-left group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink group-hover:text-accent transition-colors leading-snug truncate">
                {m.title}
              </div>
              <div className="text-xs text-ink4 mt-0.5">
                {m.date}{m.duration ? ` · ${m.duration}` : ''}
              </div>
            </div>
            <span className="text-ink4 text-xs flex-shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
          </div>

          {/* Participants — named badges for team members, avatars for unmatched */}
          {m.participants.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {(m.teamParticipants ?? []).map(name => (
                <span key={name} className="text-[10px] font-bold bg-accent-light text-accent px-1.5 py-0.5">
                  {name.split(' ')[0]}
                </span>
              ))}
              {(() => {
                const matched = new Set(m.matchedEmails ?? [])
                const unmatched = m.participants.filter(p => !matched.has(p.toLowerCase()))
                return (
                  <>
                    {unmatched.slice(0, 5).map((p, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                        style={{ background: avatarColor(p) }}
                        title={p}
                      >
                        {emailInitials(p)}
                      </div>
                    ))}
                    {unmatched.length > 5 && (
                      <span className="text-[10px] text-ink4">+{unmatched.length - 5}</span>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </button>

        {/* Expanded detail */}
        {open && (
          <div className="mt-3 space-y-3 border-l-2 border-sand4 pl-3">
            {m.overview && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">Overview</div>
                <FormattedNotes text={m.overview} className="text-sm text-ink2 leading-relaxed" />
              </div>
            )}
            {m.actionItems && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">Action Items</div>
                <FormattedNotes text={m.actionItems} className="text-sm text-ink2 leading-relaxed" />
              </div>
            )}
            {m.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {m.keywords.slice(0, 8).map((k) => (
                  <span key={k} className="text-[10px] bg-sand3 text-ink3 px-1.5 py-0.5 rounded">{k}</span>
                ))}
              </div>
            )}
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
            >
              Full transcript ↗
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MeetingTimeline({ meetings }: { meetings: Meeting[] }) {
  if (!meetings.length) return (
    <div className="card p-6 text-center text-ink4 text-sm">
      No recent meetings in Fireflies.{' '}
      <a href="https://app.fireflies.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open Fireflies ↗</a>
    </div>
  )

  return (
    <div className="card px-5 pt-5 pb-1">
      {meetings.map((m, i) => (
        <MeetingItem key={m.id} m={m} isLast={i === meetings.length - 1} />
      ))}
      <a
        href="https://app.fireflies.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium pb-4"
      >
        All meetings in Fireflies ↗
      </a>
    </div>
  )
}
