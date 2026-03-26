import type { Config } from '@netlify/functions'

// Runs daily at 8 AM PDT (15:00 UTC) / 8 AM PST (16:00 UTC in winter)
export default async function handler() {
  const baseUrl = process.env.ALLOWED_ORIGIN?.replace(/\/$/, '') ?? 'https://vsoc.netlify.app'
  const secret = process.env.CRON_SECRET ?? ''

  const res = await fetch(`${baseUrl}/api/reports/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': secret,
    },
  })

  const data = await res.json()
  console.log('Daily report result:', JSON.stringify(data))
  return { statusCode: res.status }
}

export const config: Config = {
  schedule: '0 15 * * *',  // 8 AM PDT (UTC-7). Change to 0 16 * * * in winter (PST)
}
