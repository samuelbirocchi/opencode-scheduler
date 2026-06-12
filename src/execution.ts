import { spawn } from "child_process"
import { createWriteStream } from "fs"
import { homedir } from "os"
import type { Job, JobRunSpec } from "./types.js"
import { deriveScopeId, ensureDir } from "./utils.js"
import { getLogPath, scopedLogPath } from "./paths.js"
import { getJobRun, normalizeRunSpec, validateRunSpec } from "./storage.js"
import { findOpencode } from "./schedulers/shared.js"
import { updateJobRecord } from "./storage.js"

export function buildOpencodeArgs(job: Job): { command: string; args: string[] } {
  const command = findOpencode()
  const run = normalizeRunSpec(getJobRun(job))
  validateRunSpec(run)

  const args = ["run"]

  if (run.attachUrl) {
    args.push("--attach", run.attachUrl)
  }

  if (run.port !== undefined) {
    args.push("--port", String(run.port))
  }

  if (run.command) {
    args.push("--command", run.command)
  }

  if (run.agent) {
    args.push("--agent", run.agent)
  }

  if (run.model) {
    args.push("--model", run.model)
  }

  if (run.variant) {
    args.push("--variant", run.variant)
  }

  if (run.runFormat) {
    args.push("--format", run.runFormat)
  }

  if (run.share) {
    args.push("--share")
  }

  if (run.title) {
    args.push("--title", run.title)
  }

  if (run.continue) {
    args.push("--continue")
  }

  if (run.session) {
    args.push("--session", run.session)
  }

  for (const file of run.files ?? []) {
    args.push("--file", file)
  }

  args.push("--")
  args.push(run.command ? run.arguments ?? "" : run.prompt ?? "")

  return { command, args }
}

export function runJobNow(job: Job): { startedAt: string; logPath: string; pid: number | undefined; job: Job } {
  ensureDir(scopeLogsDir(job.scopeId || deriveScopeId(job.workdir || homedir())))
  const startedAt = new Date().toISOString()
  const logPath = getLogPath(job)
  const logStream = createWriteStream(logPath, { flags: "a" })
  const workdir = job.workdir || homedir()

  logStream.write(`\n=== Manual run ${startedAt} ===\n`)

  const { command, args } = buildOpencodeArgs(job)
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(command, args, {
      cwd: workdir,
      env: buildRunEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStream.write(`\n=== Run error ${new Date().toISOString()} ===\n${message}\n`)
    logStream.end()
    updateJobRecord(job, {
      lastRunStatus: "failed",
      lastRunExitCode: undefined,
      lastRunError: message,
    })
    throw error
  }

  const runningJob = updateJobRecord(job, {
    lastRunAt: startedAt,
    lastRunSource: "manual",
    lastRunStatus: "running",
    lastRunExitCode: undefined,
    lastRunError: undefined,
  })

  if (child.stdout) child.stdout.pipe(logStream)
  if (child.stderr) child.stderr.pipe(logStream)

  child.on("error", (error) => {
    logStream.write(`\n=== Run error ${new Date().toISOString()} ===\n${error.message}\n`)
    logStream.end()
    updateJobRecord(job, {
      lastRunStatus: "failed",
      lastRunExitCode: undefined,
      lastRunError: error.message,
    })
  })

  child.on("close", (code) => {
    const exitCode = typeof code === "number" ? code : undefined
    logStream.write(`\n=== Run complete (${exitCode ?? "unknown"}) ${new Date().toISOString()} ===\n`)
    logStream.end()
    updateJobRecord(job, {
      lastRunStatus: exitCode === 0 ? "success" : "failed",
      lastRunExitCode: exitCode,
      lastRunError: exitCode === 0 ? undefined : `Exit code ${exitCode ?? "unknown"}`,
    })
  })

  return { startedAt, logPath, pid: child.pid, job: runningJob }
}

import { buildRunEnvironment } from "./schedulers/shared.js"
import { scopeLogsDir } from "./paths.js"
