import { execFileSync, execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"
import { WINDOWS_TASK_PREFIX, WINDOWS_TASK_ROOT } from "../constants.js"
import type { Job } from "../types.js"
import { ensureWindowsRepresentable } from "../cron.js"
import { getEnhancedPath } from "./shared.js"

export function windowsTaskBaseName(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  return `${WINDOWS_TASK_PREFIX}-${scopeId}-${job.slug}`
}

export function windowsTaskName(baseName: string, index: number, total: number): string {
  if (total <= 1) return baseName
  return `${baseName}-${index + 1}`
}

export function buildWindowsTaskCommand(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const jobPath = jobFilePath(scopeId, job.slug)
  const enhancedPath = getEnhancedPath()

  return `cmd /c "set PATH=${enhancedPath} && perl \\"${SUPERVISOR_PATH}\\" \\"${jobPath}\\""`
}

export function cronToWindowsTaskDefinitions(job: Job): { name: string; args: string[] }[] {
  const plans = ensureWindowsRepresentable(job.schedule)
  const baseName = windowsTaskBaseName(job)
  const command = buildWindowsTaskCommand(job)

  return plans.map((plan, index) => {
    const args = ["/Create", "/F", "/TN", windowsTaskName(baseName, index, plans.length), "/TR", command, "/SC", plan.schedule]

    if (plan.modifier) {
      args.push("/MO", plan.modifier)
    }

    if (plan.weekdays) {
      args.push("/D", plan.weekdays)
    }

    if (plan.days) {
      args.push("/D", plan.days)
    }

    if (plan.months) {
      args.push("/M", plan.months)
    }

    args.push("/ST", plan.startTime)
    return { name: windowsTaskName(baseName, index, plans.length), args }
  })
}

export function installWindowsJob(job: Job): void {
  uninstallWindowsJob(job)

  const taskDefinitions = cronToWindowsTaskDefinitions(job)
  for (const task of taskDefinitions) {
    execFileSync("schtasks", task.args, { stdio: "ignore" })
  }
}

export function uninstallWindowsJob(job: Job): void {
  const candidates = new Set<string>()
  const scopedBase = windowsTaskBaseName(job)
  const legacyBase = `${WINDOWS_TASK_PREFIX}-${job.slug}`

  for (let i = 0; i < 64; i += 1) {
    const suffix = i === 0 ? "" : `-${i + 1}`
    candidates.add(`${WINDOWS_TASK_ROOT}\\${scopedBase}${suffix}`)
    candidates.add(`${WINDOWS_TASK_ROOT}\\${legacyBase}${suffix}`)
    candidates.add(`${scopedBase}${suffix}`)
    candidates.add(`${legacyBase}${suffix}`)
  }

  for (const taskName of candidates) {
    try {
      if (existsSync(taskName)) {
        execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: "ignore" })
      }
    } catch {}
    try {
      execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: "ignore" })
    } catch {}
  }
}

import { deriveScopeId } from "../utils.js"
import { jobFilePath } from "../paths.js"
import { SUPERVISOR_PATH } from "../constants.js"
import { homedir } from "os"
