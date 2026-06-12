import { IS_LINUX, IS_MAC, IS_WINDOWS } from "../constants.js"
import type { Job, SchedulerBackend } from "../types.js"
import { installLaunchdJob, uninstallLaunchdJob } from "./launchd.js"
import { installSystemdJob, uninstallSystemdJob, isSystemdUserAvailable } from "./systemd.js"
import { installWindowsJob, uninstallWindowsJob } from "./windows.js"
import { installCronJob, uninstallCronJob, isCronAvailable } from "./cron.js"

export function resolveSchedulerBackend(): SchedulerBackend {
  if (IS_MAC) return "launchd"
  if (IS_WINDOWS) return "schtasks"
  if (isSystemdUserAvailable()) return "systemd"
  if (isCronAvailable()) return "cron"

  if (IS_LINUX) {
    throw new Error(
      "No supported scheduler backend found: systemd --user is unavailable and `crontab` is not installed."
    )
  }

  throw new Error(
    `Unsupported platform: ${process.platform}. Supported platforms: macOS (launchd), Linux (systemd or cron), Windows, and POSIX systems with cron.`
  )
}

export function installJob(job: Job): SchedulerBackend {
  const backend = resolveSchedulerBackend()
  if (backend === "launchd") {
    installLaunchdJob(job)
  } else if (backend === "systemd") {
    try {
      installSystemdJob(job)
    } catch (error) {
      if (!isCronAvailable()) {
        throw error
      }
      installCronJob(job)
      return "cron"
    }
  } else if (backend === "schtasks") {
    installWindowsJob(job)
  } else {
    installCronJob(job)
  }
  return backend
}

export function uninstallJob(job: Job): void {
  const backend = resolveSchedulerBackend()
  if (backend === "launchd") {
    uninstallLaunchdJob(job)
  } else if (backend === "systemd") {
    uninstallSystemdJob(job)
  } else if (backend === "schtasks") {
    uninstallWindowsJob(job)
  } else {
    uninstallCronJob(job)
  }
}
