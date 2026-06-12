import { homedir } from "os"
import { join } from "path"

export const OPENCODE_CONFIG = join(homedir(), ".config", "opencode")
export const LEGACY_JOBS_DIR = join(OPENCODE_CONFIG, "jobs")
export const LOGS_DIR = join(OPENCODE_CONFIG, "scheduler", "logs")
export const SCHEDULER_DIR = join(OPENCODE_CONFIG, "scheduler")
export const SCOPES_DIR = join(SCHEDULER_DIR, "scopes")
export const SUPERVISOR_PATH = join(SCHEDULER_DIR, "supervisor.pl")
export const SCHEDULER_CONFIG = join(SCHEDULER_DIR, "config.json")

export const IS_MAC = process.platform === "darwin"
export const IS_LINUX = process.platform === "linux"
export const IS_WINDOWS = process.platform === "win32"

export const LAUNCH_AGENTS_DIR = join(homedir(), "Library", "LaunchAgents")
export const LAUNCHD_PREFIX = "com.opencode.job"

export const SYSTEMD_USER_DIR = join(homedir(), ".config", "systemd", "user")

export const WINDOWS_TASK_ROOT = "\\OpenCode"
export const WINDOWS_TASK_PREFIX = "OpenCode"

export const CRON_MANAGED_PREFIX = "OPENCODE-SCHEDULER"
