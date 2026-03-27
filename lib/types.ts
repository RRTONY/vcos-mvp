// Shared types used across pages and API routes

export interface Task {
  id: string
  name: string
  list: string
  dueDate: string
  priority: string
  url: string
  assignees: string[]
}

export interface AssigneeStat {
  total: number
  overdue: number
  urgent: number
}

export interface ClickUpData {
  totalTasks?: number
  overdue?: number
  overduePercent?: number
  urgent?: number
  completed?: number
  urgentDetails?: Task[]
  highDetails?: Task[]
  overdueDetails?: Task[]
  assigneeStats?: Record<string, AssigneeStat>
  tasksByAssignee?: Record<string, Task[]>
  error?: string
}

export interface SlackData {
  weeklyReports?: { filed: string[]; missing: string[]; week: string }
  slackStats?: { totalMessages: number; activeMembers: number; channels: number }
  error?: string
}

export interface WebWorkMember {
  username: string
  totalHours: number
  byDay: { date: string; hours: number }[]
}

export interface Meeting {
  id: string
  title: string
  date: string
  duration: string
  participants: string[]
  overview: string
  actionItems: string
  keywords: string[]
  url: string
}

export interface Me {
  username: string
  role: 'owner' | 'admin' | 'user'
}
