'use client'

import { useEffect, useState } from 'react'
import type { Me } from '@/lib/types'

export function useMe() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(setMe)
      .catch(() => {})
  }, [])

  return {
    me,
    isAdmin: ['admin', 'owner'].includes(me?.role ?? ''),
    isOwner: me?.role === 'owner',
  }
}
