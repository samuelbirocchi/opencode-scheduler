import { homedir } from "os"
import { join } from "path"
import { LOGS_DIR, SCOPES_DIR } from "./constants.js"
import { deriveScopeId, ensureDir } from "./utils.js"

export function scopedLogPath(scopeId: string, slug: string): string {
  return join(LOGS_DIR, "scheduler", scopeId, `${slug}.log`)
}

export function jobFilePath(scopeId: string, slug: string): string {
  return join(scopeJobsDir(scopeId), `${slug}.json`)
}

export function scopeJobsDir(scopeId: string): string {
  return join(scopeDir(scopeId), "jobs")
}

export function scopeLocksDir(scopeId: string): string {
  return join(scopeDir(scopeId), "locks")
}

export function scopeRunsDir(scopeId: string): string {
  return join(scopeDir(scopeId), "runs")
}

export function scopeLogsDir(scopeId: string): string {
  return join(scopeDir(scopeId), "logs")
}

export function scopeDir(scopeId: string): string {
  return join(SCOPES_DIR, scopeId)
}

export function currentScopeId(): string {
  return deriveScopeId(process.cwd())
}

export function normalizeWorkdirPath(workdir: string): string {
  const trimmed = workdir.trim()
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

export function getLogPath(job: { scopeId?: string; workdir?: string; slug: string }): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  return scopedLogPath(scopeId, job.slug)
}
