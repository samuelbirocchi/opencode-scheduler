import { execFileSync } from "child_process"
import { IS_WINDOWS, CRON_MANAGED_PREFIX } from "../constants.js"
import type { Job } from "../types.js"
import { ensureDir } from "../utils.js"
import { jobFilePath, scopeLogsDir } from "../paths.js"
import { ensureSupervisorScript } from "../supervisor.js"
import { getEnhancedPath } from "./shared.js"

export function isCronAvailable(): boolean {
  if (IS_WINDOWS) return false
  return isCommandAvailable("crontab")
}

export function cronBlockId(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  return `${scopeId}:${job.slug}`
}

export function cronLegacyBlockId(job: Job): string {
  return `legacy:${job.slug}`
}

export function cronBlockStart(id: string): string {
  return `# BEGIN ${CRON_MANAGED_PREFIX} ${id}`
}

export function cronBlockEnd(id: string): string {
  return `# END ${CRON_MANAGED_PREFIX} ${id}`
}

export function shellEscapeDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1")
}

export function readUserCrontab(): string {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf-8" }) as string
  } catch (error) {
    const status = typeof error === "object" && error !== null ? (error as { status?: number }).status : undefined
    const stderrValue =
      typeof error === "object" && error !== null && "stderr" in error
        ? (error as { stderr?: string | Buffer }).stderr
        : undefined
    const stderr = Buffer.isBuffer(stderrValue) ? stderrValue.toString("utf-8") : (stderrValue ?? "")
    const noCrontab = status === 1 && (!stderr.trim() || /no crontab/i.test(stderr))
    if (noCrontab) return ""
    throw error
  }
}

export function writeUserCrontab(content: string): void {
  const normalized = content.trim()
  const input = normalized ? `${normalized}\n` : ""
  execFileSync("crontab", ["-"], { input })
}

export function stripManagedCronBlocks(content: string, blockIds: Set<string>): { content: string; removed: number } {
  const lines = content ? content.split(/\r?\n/) : []
  const retained: string[] = []
  const prefix = `# BEGIN ${CRON_MANAGED_PREFIX} `
  const endPrefix = `# END ${CRON_MANAGED_PREFIX} `
  let removed = 0

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    if (!line.startsWith(prefix)) {
      retained.push(line)
      index += 1
      continue
    }

    const id = line.slice(prefix.length).trim()
    let endIndex = lines.length - 1
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      if (lines[probe] === `${endPrefix}${id}`) {
        endIndex = probe
        break
      }
    }

    if (blockIds.has(id)) {
      removed += 1
    } else {
      for (let keep = index; keep <= endIndex; keep += 1) {
        retained.push(lines[keep])
      }
    }

    index = endIndex + 1
  }

  return { content: retained.join("\n"), removed }
}

export function createCronEntry(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const jobPath = jobFilePath(scopeId, job.slug)
  const logFilePath = scopedLogPath(scopeId, job.slug)
  const escapedSupervisor = shellEscapeDoubleQuoted(SUPERVISOR_PATH)
  const escapedJobPath = shellEscapeDoubleQuoted(jobPath)
  const escapedLogPath = shellEscapeDoubleQuoted(logFilePath)
  const escapedPath = shellEscapeDoubleQuoted(getEnhancedPath())

  return `${job.schedule} PATH="${escapedPath}" /usr/bin/perl "${escapedSupervisor}" "${escapedJobPath}" >> "${escapedLogPath}" 2>&1`
}

export function installCronJob(job: Job): void {
  if (!isCronAvailable()) {
    throw new Error("cron backend is unavailable: `crontab` command not found.")
  }

  ensureDir(scopeLogsDir(job.scopeId || deriveScopeId(job.workdir || homedir())))
  ensureSupervisorScript()

  const blockId = cronBlockId(job)
  const current = readUserCrontab()
  const stripped = stripManagedCronBlocks(current, new Set([blockId, cronLegacyBlockId(job)]))
  const block = [cronBlockStart(blockId), createCronEntry(job), cronBlockEnd(blockId)].join("\n")
  const next = [stripped.content.trim(), block].filter(Boolean).join("\n\n")
  writeUserCrontab(next)
}

export function uninstallCronJob(job: Job): void {
  if (!isCronAvailable()) return

  const current = readUserCrontab()
  const stripped = stripManagedCronBlocks(current, new Set([cronBlockId(job), cronLegacyBlockId(job)]))
  if (stripped.removed === 0) return
  writeUserCrontab(stripped.content)
}

import { deriveScopeId } from "../utils.js"
import { scopedLogPath } from "../paths.js"
import { SUPERVISOR_PATH } from "../constants.js"
import { isCommandAvailable } from "./shared.js"
import { homedir } from "os"
