import { existsSync, rmSync } from "fs"
import { join } from "path"
import { IS_LINUX, IS_MAC, LAUNCH_AGENTS_DIR, LAUNCHD_PREFIX, LEGACY_JOBS_DIR, LOGS_DIR, SCOPES_DIR, SYSTEMD_USER_DIR } from "./constants.js"
import type { GlobalCleanupExecution, GlobalCleanupPlan } from "./types.js"
import { listDirectoryFiles, listDirectoryNames, uniquePaths } from "./utils.js"
import { scopeJobsDir, scopeLocksDir, scopeRunsDir } from "./paths.js"
import { loadAllJobsAcrossScopes, loadAllLegacyJobs } from "./storage.js"
import { uninstallJob } from "./schedulers/index.js"

export function buildGlobalCleanupPlan(includeHistory: boolean): GlobalCleanupPlan {
  const scopeIds = listScopeIds()
  const scopedJobDefinitionPaths = scopeIds.flatMap((scopeId) => listDirectoryFiles(scopeJobsDir(scopeId), { suffix: ".json" }))
  const lockPaths = scopeIds.flatMap((scopeId) => listDirectoryFiles(scopeLocksDir(scopeId), { suffix: ".json" }))
  const runHistoryPaths = includeHistory
    ? scopeIds.flatMap((scopeId) => listDirectoryFiles(scopeRunsDir(scopeId), { suffix: ".jsonl" }))
    : []

  const schedulerLogsRoot = join(LOGS_DIR, "scheduler")
  const logScopeIds = listDirectoryNames(schedulerLogsRoot)
  const logPaths = includeHistory
    ? logScopeIds.flatMap((scopeId) => listDirectoryFiles(join(schedulerLogsRoot, scopeId), { suffix: ".log" }))
    : []

  const launchdPaths = IS_MAC
    ? listDirectoryFiles(LAUNCH_AGENTS_DIR, { prefix: `${LAUNCHD_PREFIX}.`, suffix: ".plist" })
    : []
  const systemdPaths = IS_LINUX
    ? [
        ...listDirectoryFiles(SYSTEMD_USER_DIR, { prefix: "opencode-job-", suffix: ".service" }),
        ...listDirectoryFiles(SYSTEMD_USER_DIR, { prefix: "opencode-job-", suffix: ".timer" }),
      ]
    : []

  const jobsToUninstall = [...loadAllJobsAcrossScopes(), ...loadAllLegacyJobs()]

  return {
    scopeIds,
    jobsToUninstall,
    scopedJobDefinitionPaths: uniquePaths(scopedJobDefinitionPaths),
    legacyJobDefinitionPaths: listDirectoryFiles(LEGACY_JOBS_DIR, { suffix: ".json" }),
    lockPaths: uniquePaths(lockPaths),
    runHistoryPaths: uniquePaths(runHistoryPaths),
    logPaths: uniquePaths(logPaths),
    launchdPaths: uniquePaths(launchdPaths),
    systemdPaths: uniquePaths(systemdPaths),
  }
}

export function executeGlobalCleanup(plan: GlobalCleanupPlan, options: { dryRun: boolean; includeHistory: boolean }): GlobalCleanupExecution {
  const errors: string[] = []
  const dryRun = options.dryRun

  if (!dryRun) {
    for (const job of plan.jobsToUninstall) {
      try {
        uninstallJob(job)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push(`Failed to uninstall scheduler entry for ${job.slug}: ${msg}`)
      }
    }
  }

  const removeOrPreview = (paths: string[]): string[] => {
    if (dryRun) return uniquePaths(paths).filter((path) => existsSync(path))
    return removePaths(paths, errors)
  }

  const removed = {
    scopedJobDefinitions: removeOrPreview(plan.scopedJobDefinitionPaths),
    legacyJobDefinitions: removeOrPreview(plan.legacyJobDefinitionPaths),
    locks: removeOrPreview(plan.lockPaths),
    runHistory: options.includeHistory ? removeOrPreview(plan.runHistoryPaths) : [],
    logs: options.includeHistory ? removeOrPreview(plan.logPaths) : [],
    launchdUnits: removeOrPreview(plan.launchdPaths),
    systemdUnits: removeOrPreview(plan.systemdPaths),
  }

  return {
    dryRun,
    includeHistory: options.includeHistory,
    removed,
    errors,
  }
}

export function formatGlobalCleanupOutput(execution: GlobalCleanupExecution): string {
  const mode = execution.dryRun ? "DRY RUN (no files deleted)" : "EXECUTED"
  const lines = [
    `Global scheduler cleanup: ${mode}`,
    "",
    formatCleanupLine("Scoped job definitions", execution.removed.scopedJobDefinitions.length, `${SCOPES_DIR}/*/jobs`),
    formatCleanupLine("Legacy job definitions", execution.removed.legacyJobDefinitions.length, LEGACY_JOBS_DIR),
    formatCleanupLine("Lock files", execution.removed.locks.length, `${SCOPES_DIR}/*/locks`),
  ]

  if (execution.includeHistory) {
    lines.push(formatCleanupLine("Run history", execution.removed.runHistory.length, `${SCOPES_DIR}/*/runs`))
    lines.push(formatCleanupLine("Logs", execution.removed.logs.length, `${LOGS_DIR}/scheduler`))
  }

  lines.push(formatCleanupLine("Launchd units", execution.removed.launchdUnits.length, LAUNCH_AGENTS_DIR))
  lines.push(formatCleanupLine("Systemd units", execution.removed.systemdUnits.length, SYSTEMD_USER_DIR))

  if (execution.errors.length > 0) {
    lines.push("", "Errors:")
    for (const error of execution.errors) {
      lines.push(`  - ${error}`)
    }
  }

  return lines.join("\n")
}

function removePaths(paths: string[], errors: string[]): string[] {
  const removed: string[] = []
  for (const path of uniquePaths(paths)) {
    if (!existsSync(path)) continue
    try {
      rmSync(path, { recursive: true, force: true })
      removed.push(path)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`Failed to remove ${path}: ${msg}`)
    }
  }
  return removed
}

function formatCleanupLine(label: string, count: number, location: string): string {
  return `- ${label}: ${count} (${location})`
}

import { listScopeIds } from "./storage.js"
