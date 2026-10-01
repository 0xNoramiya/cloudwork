import {
  AlertTriangle,
  Award,
  Ban,
  Brain,
  Coffee,
  Hammer,
  Hand,
  HelpCircle,
  MessageCircle,
  Moon,
  Package,
  PartyPopper,
  Sparkles,
  Users,
  Wrench,
  Anchor,
  CloudSun,
  Map as MapIcon,
  Medal,
  Rocket,
  SlidersHorizontal,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { AgentActivity, TaskStatus } from '../engine/types'

export const ACTIVITY_ICON: Record<AgentActivity, LucideIcon> = {
  idle: Coffee,
  thinking: Brain,
  working: Hammer,
  tool: Wrench,
  awaiting_approval: Hand,
  needs_input: HelpCircle,
  blocked: Ban,
  handoff: Package,
  memory: Sparkles,
  celebrating: PartyPopper,
  paused: Moon,
  error: AlertTriangle,
  chatting: MessageCircle,
  meeting: Users,
}

export const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  working: 'Working',
  tool: 'Using a tool',
  awaiting_approval: 'Needs approval',
  needs_input: 'Has a question',
  blocked: 'Blocked',
  handoff: 'Handing off',
  memory: 'Filing memories',
  celebrating: 'Celebrating',
  paused: 'Paused',
  error: 'Error',
  chatting: 'Chatting',
  meeting: 'In the huddle',
}

/** Semantic tone for status colors (see --tone-* tokens in CSS). */
export function activityTone(a: AgentActivity): 'idle' | 'busy' | 'wait' | 'bad' | 'good' | 'info' {
  switch (a) {
    case 'thinking':
    case 'working':
    case 'tool':
    case 'memory':
      return 'busy'
    case 'awaiting_approval':
    case 'needs_input':
      return 'wait'
    case 'blocked':
    case 'error':
      return 'bad'
    case 'celebrating':
      return 'good'
    case 'handoff':
    case 'chatting':
    case 'meeting':
      return 'info'
    default:
      return 'idle'
  }
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Waiting on inputs',
  handoff: 'Hand-off in transit',
  ready: 'Queued',
  running: 'In progress',
  awaiting_approval: 'Awaiting approval',
  needs_input: 'Needs your answer',
  blocked: 'Blocked',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  paused: 'Paused',
}

export function taskTone(s: TaskStatus): 'idle' | 'busy' | 'wait' | 'bad' | 'good' | 'info' {
  switch (s) {
    case 'running':
      return 'busy'
    case 'awaiting_approval':
    case 'needs_input':
      return 'wait'
    case 'failed':
    case 'blocked':
      return 'bad'
    case 'done':
      return 'good'
    case 'handoff':
    case 'ready':
      return 'info'
    default:
      return 'idle'
  }
}

/** Icon for a log line that has no crew member attached (system, captain and project events). */
const LOG_ICON: Record<string, LucideIcon> = {
  project: Target,
  plan: MapIcon,
  control: SlidersHorizontal,
  approval: Anchor,
  deliver: Rocket,
  session: CloudSun,
  achievement: Award,
  level: Award,
  rank: Medal,
  budget: Wallet,
  error: AlertTriangle,
  event: Sparkles,
}

export function logIcon(type: string): LucideIcon {
  return LOG_ICON[type] ?? Sparkles
}
