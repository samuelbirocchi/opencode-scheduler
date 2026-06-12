import { existsSync, readFileSync } from "fs"
import { execFileSync } from "child_process"
import { homedir } from "os"
import type { Job } from "./types.js"
import { getLogPath } from "./paths.js"
import { getJobRun, normalizeRunSpec } from "./storage.js"
import { buildRunEnvironment } from "./schedulers/shared.js"
import { describeCron } from "./cron.js"

type OutputFormat = "text" | "json"

interface ToolResult<T = unknown> {
  success: boolean
  output: string
  shouldContinue: boolean
  data?: T
}

export function formatJobDetails(job: Job): string {
  const lines = [
    `Job: ${job.name}`,
    `Slug: ${job.slug}`,
    `Schedule: ${job.schedule} (${describeCron(job.schedule)})`,
    `Working Directory: ${job.workdir || homedir()}`,
  ]

  const run = (() => {
    try {
      return normalizeRunSpec(getJobRun(job))
    } catch {
      return undefined
    }
  })()

  if (run?.attachUrl) {
    lines.push(`Attach URL: ${run.attachUrl}`)
  } else if (job.attachUrl) {
    lines.push(`Attach URL: ${job.attachUrl}`)
  }

  if (run?.command) {
    lines.push(`Command: ${run.command}`)
    if (run.arguments) lines.push(`Arguments: ${run.arguments}`)
  }

  if (run?.prompt) {
    lines.push(`Prompt: ${run.prompt}`)
  } else if (job.prompt) {
    lines.push(`Prompt: ${job.prompt}`)
  }

  if (run?.files?.length) {
    lines.push(`Files: ${run.files.join(", ")}`)
  }

  if (run?.agent) {
    lines.push(`Agent: ${run.agent}`)
  }

  if (run?.model) {
    lines.push(`Model: ${run.model}`)
  }

  if (run?.variant) {
    lines.push(`Variant: ${run.variant}`)
  }

  if (run?.runFormat) {
    lines.push(`Run Format: ${run.runFormat}`)
  }

  if (run?.title) {
    lines.push(`Title: ${run.title}`)
  }

  if (run?.share) {
    lines.push("Share: true")
  }

  if (run?.continue) {
    lines.push("Continue: true")
  }

  if (run?.session) {
    lines.push(`Session: ${run.session}`)
  }

  if (run?.port !== undefined) {
    lines.push(`Port: ${run.port}`)
  }

  lines.push(`Created: ${job.createdAt}`)

  if (job.updatedAt) {
    lines.push(`Updated: ${job.updatedAt}`)
  }

  if (job.lastRunAt) {
    lines.push(`Last Run: ${job.lastRunAt}`)
  }

  if (job.lastRunSource) {
    lines.push(`Last Run Source: ${job.lastRunSource}`)
  }

  if (job.lastRunStatus) {
    lines.push(`Last Run Status: ${job.lastRunStatus}`)
  }

  if (job.lastRunExitCode !== undefined) {
    lines.push(`Last Exit Code: ${job.lastRunExitCode}`)
  }

  if (job.lastRunError) {
    lines.push(`Last Error: ${job.lastRunError}`)
  }

  return lines.join("\n")
}

export function getJobLogs(job: Job, options?: { tailLines?: number; maxChars?: number }): string | null {
  const logPath = getLogPath(job)
  if (!existsSync(logPath)) return null

  const maxChars = options?.maxChars ?? 5000
  const tailLines = options?.tailLines

  try {
    if (typeof tailLines === "number" && Number.isFinite(tailLines) && tailLines > 0) {
      const clampedLines = Math.max(1, Math.min(5000, Math.floor(tailLines)))

      try {
        const output = execFileSync("tail", ["-n", String(clampedLines), logPath], {
          env: buildRunEnvironment(),
        }).toString()
        return output.length > maxChars ? output.slice(-maxChars) : output
      } catch {
        const content = readFileSync(logPath, "utf-8")
        const lines = content.split(/\r?\n/)
        const output = lines.slice(-clampedLines).join("\n")
        return output.length > maxChars ? output.slice(-maxChars) : output
      }
    }

    const content = readFileSync(logPath, "utf-8")
    return content.length > maxChars ? content.slice(-maxChars) : content
  } catch {
    return null
  }
}

export function okResult<T>(format: OutputFormat, output: string, data?: T): string {
  return formatToolResult(format, { success: true, output, shouldContinue: false, data })
}

export function errorResult<T>(format: OutputFormat, output: string, data?: T): string {
  return formatToolResult(format, { success: false, output, shouldContinue: true, data })
}

export function normalizeFormat(format?: string): OutputFormat {
  return format === "json" ? "json" : "text"
}

function formatToolResult<T>(format: OutputFormat, result: ToolResult<T>): string {
  return format === "json" ? JSON.stringify(result, null, 2) : result.output
}
