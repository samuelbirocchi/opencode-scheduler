import { existsSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { homedir } from "os"
import { LAUNCH_AGENTS_DIR, LAUNCHD_PREFIX } from "../constants.js"
import type { Job } from "../types.js"
import { ensureDir } from "../utils.js"
import { jobFilePath, scopeLogsDir } from "../paths.js"
import { cronToLaunchdCalendars, renderLaunchdCalendar } from "../cron.js"
import { ensureSupervisorScript } from "../supervisor.js"
import { getEnhancedPath } from "./shared.js"

export function createLaunchdPlist(job: Job): string {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const label = `${LAUNCHD_PREFIX}.${scopeId}.${job.slug}`
  const logFilePath = scopedLogPath(scopeId, job.slug)
  const jobPath = jobFilePath(scopeId, job.slug)

  const calendars = cronToLaunchdCalendars(job.schedule)
  const calendarXml =
    calendars.length === 1
      ? `  <dict>\n${renderLaunchdCalendar(calendars[0])}\n  </dict>`
      : `  <array>\n${calendars
          .map((calendar) => `  <dict>\n${renderLaunchdCalendar(calendar)}\n  </dict>`)
          .join("\n")}\n  </array>`

  const programArgumentsXml = [
    `    <string>${escapePlistString("/usr/bin/perl")}</string>`,
    `    <string>${escapePlistString(SUPERVISOR_PATH)}</string>`,
    `    <string>${escapePlistString(jobPath)}</string>`,
  ].join("\n")

  const workdir = job.workdir || homedir()
  const enhancedPath = getEnhancedPath()

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  
  <key>WorkingDirectory</key>
  <string>${escapePlistString(workdir)}</string>
  
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${enhancedPath}</string>
  </dict>
  
  <key>ProgramArguments</key>
  <array>
${programArgumentsXml}
  </array>
  
  <key>StartCalendarInterval</key>
${calendarXml}
  
  <key>StandardOutPath</key>
  <string>${logFilePath}</string>
  
  <key>StandardErrorPath</key>
  <string>${logFilePath}</string>
  
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`
}

export function installLaunchdJob(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  ensureDir(scopeLogsDir(scopeId))
  ensureSupervisorScript()

  const legacyLabel = `${LAUNCHD_PREFIX}.${job.slug}`
  const legacyPlistPath = join(LAUNCH_AGENTS_DIR, `${legacyLabel}.plist`)

  const label = `${LAUNCHD_PREFIX}.${scopeId}.${job.slug}`
  const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`)

  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "ignore" })
  } catch {}

  if (existsSync(legacyPlistPath)) {
    try {
      execSync(`launchctl unload "${legacyPlistPath}" 2>/dev/null`, { stdio: "ignore" })
    } catch {}
  }

  const plist = createLaunchdPlist(job)
  writeFileSync(plistPath, plist)

  execSync(`launchctl load "${plistPath}"`)
}

export function uninstallLaunchdJob(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const scopedLabel = `${LAUNCHD_PREFIX}.${scopeId}.${job.slug}`
  const scopedPlistPath = join(LAUNCH_AGENTS_DIR, `${scopedLabel}.plist`)

  const legacyLabel = `${LAUNCHD_PREFIX}.${job.slug}`
  const legacyPlistPath = join(LAUNCH_AGENTS_DIR, `${legacyLabel}.plist`)

  for (const plistPath of [scopedPlistPath, legacyPlistPath]) {
    if (!existsSync(plistPath)) continue
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" })
    } catch {}
    try {
      unlinkSync(plistPath)
    } catch {}
  }
}

function escapePlistString(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

import { deriveScopeId } from "../utils.js"
import { scopedLogPath } from "../paths.js"
import { SUPERVISOR_PATH } from "../constants.js"
