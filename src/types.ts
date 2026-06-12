export type SchedulerBackend = "launchd" | "systemd" | "schtasks" | "cron"

export type OpencodeRunFormat = "default" | "json"

export interface JobRunSpec {
  prompt?: string
  command?: string
  arguments?: string
  files?: string[]
  agent?: string
  model?: string
  variant?: string
  title?: string
  share?: boolean
  continue?: boolean
  session?: string
  runFormat?: OpencodeRunFormat
  attachUrl?: string
  port?: number
}

export interface JobInvocation {
  command: string
  args: string[]
}

export interface Job {
  scopeId?: string
  slug: string
  name: string
  schedule: string
  source?: string
  workdir?: string
  timeoutSeconds?: number
  createdAt: string
  updatedAt?: string
  prompt?: string
  attachUrl?: string
  run?: JobRunSpec
  invocation?: JobInvocation
  lastRunAt?: string
  lastRunSource?: string
  lastRunStatus?: "success" | "failed" | "running"
  lastRunExitCode?: number
  lastRunError?: string
}

export interface WindowsTaskPlan {
  schedule: string
  modifier?: string
  weekdays?: string
  days?: string
  months?: string
  startTime: string
}

export interface WindowsTaskDefinition {
  name: string
  args: string[]
}

export interface LaunchdCalendar {
  Minute?: string
  Hour?: string
  Day?: string
  Weekday?: string
  Month?: string
}

export interface SchedulerConfig {
  env?: {
    preserveOpencodeEnv?: boolean
    preserve?: string[]
    set?: Record<string, string>
  }
}

export interface GlobalCleanupPlan {
  scopeIds: string[]
  jobsToUninstall: Job[]
  scopedJobDefinitionPaths: string[]
  legacyJobDefinitionPaths: string[]
  lockPaths: string[]
  runHistoryPaths: string[]
  logPaths: string[]
  launchdPaths: string[]
  systemdPaths: string[]
}

export interface GlobalCleanupExecution {
  dryRun: boolean
  includeHistory: boolean
  removed: {
    scopedJobDefinitions: string[]
    legacyJobDefinitions: string[]
    locks: string[]
    runHistory: string[]
    logs: string[]
    launchdUnits: string[]
    systemdUnits: string[]
  }
  errors: string[]
}

export interface BuiltinSkill {
  name: string
  description: string
  suggestedPath: string
  files: Record<string, string>
}
