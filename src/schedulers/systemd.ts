import { execFileSync, execSync } from "child_process"
import { existsSync, unlinkSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import { IS_LINUX, SYSTEMD_USER_DIR } from "../constants.js"
import type { Job } from "../types.js"
import { ensureDir } from "../utils.js"
import { jobFilePath, scopeLogsDir } from "../paths.js"
import { cronToSystemdCalendars } from "../cron.js"
import { ensureSupervisorScript } from "../supervisor.js"

export function createSystemdService(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const logFilePath = scopedLogPath(scopeId, job.slug)
  const jobPath = jobFilePath(scopeId, job.slug)
  const workdir = job.workdir || homedir()
  const enhancedPath = getEnhancedPath()

  const execStart = ["/usr/bin/perl", SUPERVISOR_PATH, jobPath]
    .map((arg) => `"${escapeSystemdArg(arg)}"`)
    .join(" ")

  return `[Unit]
Description=OpenCode Job: ${job.name}

[Service]
Type=oneshot
WorkingDirectory=${workdir}
Environment="PATH=${enhancedPath}"
ExecStart=${execStart}
StandardOutput=append:${logFilePath}
StandardError=append:${logFilePath}

[Install]
WantedBy=default.target
`
}

export function createSystemdTimer(job: Job): string {
  const calendars = cronToSystemdCalendars(job.schedule)
  const calendarLines = calendars.map((calendar) => `OnCalendar=${calendar}`).join("\n")

  return `[Unit]
Description=Timer for OpenCode Job: ${job.name}

[Timer]
${calendarLines}
Persistent=true

[Install]
WantedBy=timers.target
`
}

export function installSystemdJob(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  ensureDir(scopeLogsDir(scopeId))
  ensureSupervisorScript()

  const servicePath = join(SYSTEMD_USER_DIR, `opencode-job-${scopeId}-${job.slug}.service`)
  const timerPath = join(SYSTEMD_USER_DIR, `opencode-job-${scopeId}-${job.slug}.timer`)

  try {
    execSync(`systemctl --user stop opencode-job-${job.slug}.timer`, { stdio: "ignore" })
    execSync(`systemctl --user disable opencode-job-${job.slug}.timer`, { stdio: "ignore" })
  } catch {}

  writeFileSync(servicePath, createSystemdService(job))
  writeFileSync(timerPath, createSystemdTimer(job))

  execSync("systemctl --user daemon-reload")
  execSync(`systemctl --user enable opencode-job-${scopeId}-${job.slug}.timer`)
  execSync(`systemctl --user start opencode-job-${scopeId}-${job.slug}.timer`)
}

export function uninstallSystemdJob(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())

  const scopedTimerUnit = `opencode-job-${scopeId}-${job.slug}.timer`
  const legacyTimerUnit = `opencode-job-${job.slug}.timer`

  for (const timerUnit of [scopedTimerUnit, legacyTimerUnit]) {
    try {
      execSync(`systemctl --user stop ${timerUnit}`, { stdio: "ignore" })
      execSync(`systemctl --user disable ${timerUnit}`, { stdio: "ignore" })
    } catch {}
  }

  const scopedServicePath = join(SYSTEMD_USER_DIR, `opencode-job-${scopeId}-${job.slug}.service`)
  const scopedTimerPath = join(SYSTEMD_USER_DIR, `opencode-job-${scopeId}-${job.slug}.timer`)
  const legacyServicePath = join(SYSTEMD_USER_DIR, `opencode-job-${job.slug}.service`)
  const legacyTimerPath = join(SYSTEMD_USER_DIR, `opencode-job-${job.slug}.timer`)

  for (const p of [scopedServicePath, scopedTimerPath, legacyServicePath, legacyTimerPath]) {
    if (existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {}
    }
  }

  try {
    execSync("systemctl --user daemon-reload", { stdio: "ignore" })
  } catch {}
}

export function isSystemdUserAvailable(): boolean {
  if (!IS_LINUX) return false
  if (!isCommandAvailable("systemctl")) return false
  try {
    execSync("systemctl --user show-environment", {
      stdio: "ignore",
      env: buildRunEnvironment(),
    })
    return true
  } catch {
    return false
  }
}

function escapeSystemdArg(value: string): string {
  return value.replace(/"/g, "\\\\").replace(/\\/g, "\\\\")
}

import { deriveScopeId } from "../utils.js"
import { scopedLogPath } from "../paths.js"
import { SUPERVISOR_PATH } from "../constants.js"
import { isCommandAvailable, getEnhancedPath, buildRunEnvironment } from "./shared.js"
