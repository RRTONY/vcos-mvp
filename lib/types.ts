// Shared types used across pages and API routes

export interface Task {
  id: string;
  name: string;
  list: string;
  dueDate: string;
  dueTs: number | null;
  priority: string;
  url: string;
  assignees: string[];
  isSubtask: boolean;
}

export interface AssigneeStat {
  total: number;
  overdue: number;
  urgent: number;
}

export interface ClickUpData {
  totalTasks?: number;
  overdue?: number;
  overduePercent?: number;
  urgent?: number;
  completed?: number;
  urgentDetails?: Task[];
  highDetails?: Task[];
  overdueDetails?: Task[];
  assigneeStats?: Record<string, AssigneeStat>;
  tasksByAssignee?: Record<string, Task[]>;
  assigneeAvatars?: Record<
    string,
    { image: string | null; initials: string | null; color: string | null }
  >;
  error?: string;
}

export interface SlackData {
  weeklyReports?: { filed: string[]; missing: string[]; week: string };
  slackStats?: {
    totalMessages: number;
    activeMembers: number;
    channels: number;
    messagesByDay?: { date: string; count: number }[];
  };
  error?: string;
}

export interface WebWorkMember {
  username: string;
  totalHours: number;
  lastWeekHours?: number;
  byDay: { date: string; hours: number }[];
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  participants: string[];
  teamParticipants: string[];
  matchedEmails: string[];
  overview: string;
  actionItems: string;
  keywords: string[];
  url: string;
}

export interface Me {
  username: string;
  role: "owner" | "admin" | "user";
  fullName: string | null;
  filesReport: boolean;
}

export interface MeetingPrepRow {
  id: string;
  submitted_by: string;
  meeting_date: string;
  wins: string | null;
  priorities: string | null;
  blockers: string | null;
  decisions: string | null;
  fyis: string | null;
}
