import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { LEGACY_JOBS_DIR, SCOPES_DIR } from "./constants.js"
import type { Job, JobRunSpec } from "./types.js"
import { deriveScopeId, ensureDir, isRecord } from "./utils.js"
import { jobFilePath, scopeDir, scopeJobsDir, scopeLocksDir, scopeLogsDir, scopeRunsDir } from "./paths.js"

export function ensureScopeStorage(scopeId: string): void {
  ensureDir(SCOPES_DIR)
  ensureDir(scopeJobsDir(scopeId))
  ensureDir(scopeLocksDir(scopeId))
  ensureDir(scopeRunsDir(scopeId))
  ensureDir(scopeLogsDir(scopeId))
}

export function loadScopedJob(scopeId: string, slug: string): Job | null {
  ensureScopeStorage(scopeId)
  const path = jobFilePath(scopeId, slug)
  if (!existsSync(path)) return null
  try {
    return normalizeJob(JSON.parse(readFileSync(path, "utf-8")))
  } catch {
    return null
  }
}

export function loadAllScopedJobs(scopeId: string): Job[] {
  ensureScopeStorage(scopeId)
  const files = readdirSync(scopeJobsDir(scopeId)).filter((f) => f.endsWith(".json"))
  return files
    .map((f) => {
      try {
        return normalizeJob(JSON.parse(readFileSync(join(scopeJobsDir(scopeId), f), "utf-8")))
      } catch {
        return null
      }
    })
    .filter(Boolean) as Job[]
}

export function listScopeIds(): string[] {
  ensureDir(SCOPES_DIR)
  try {
    return readdirSync(SCOPES_DIR)
      .filter((name) => {
        try {
          return existsSync(scopeDir(name))
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return []
  }
}

export function loadAllJobsAcrossScopes(): Job[] {
  const scopeIds = listScopeIds()
  const out: Job[] = []
  for (const scopeId of scopeIds) {
    out.push(...loadAllScopedJobs(scopeId))
  }
  return out
}

export function loadLegacyJob(slug: string): Job | null {
  ensureDir(LEGACY_JOBS_DIR)
  const path = join(LEGACY_JOBS_DIR, `${slug}.json`)
  if (!existsSync(path)) return null
  try {
    return normalizeJob(JSON.parse(readFileSync(path, "utf-8")))
  } catch {
    return null
  }
}

export function loadAllLegacyJobs(): Job[] {
  ensureDir(LEGACY_JOBS_DIR)
  const files = readdirSync(LEGACY_JOBS_DIR).filter((f) => f.endsWith(".json"))
  return files
    .map((f) => {
      try {
        return normalizeJob(JSON.parse(readFileSync(join(LEGACY_JOBS_DIR, f), "utf-8")))
      } catch {
        return null
      }
    })
    .filter(Boolean) as Job[]
}

export function saveJob(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const normalizedJob: Job = { ...job, scopeId }
  ensureScopeStorage(scopeId)
  const path = jobFilePath(scopeId, normalizedJob.slug)
  writeFileSync(path, JSON.stringify(sanitizeJob(normalizedJob), null, 2))
}

export function deleteJobFile(job: Job): void {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const path = jobFilePath(scopeId, job.slug)
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {}
  }
}

export function normalizeJob(raw: unknown): Job | null {
  if (!isRecord(raw)) return null

  if (typeof raw.slug !== "string" || typeof raw.name !== "string" || typeof raw.schedule !== "string") {
    return null
  }

  const job: Job = {
    scopeId: typeof raw.scopeId === "string" ? raw.scopeId : undefined,
    slug: raw.slug,
    name: raw.name,
    schedule: raw.schedule,
    source: typeof raw.source === "string" ? raw.source : undefined,
    workdir: typeof raw.workdir === "string" ? raw.workdir : undefined,
    timeoutSeconds: typeof raw.timeoutSeconds === "number" ? raw.timeoutSeconds : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
    attachUrl: typeof raw.attachUrl === "string" ? raw.attachUrl : undefined,
    run: normalizeJobRun(raw.run),
    invocation: normalizeJobInvocation(raw.invocation),
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : undefined,
    lastRunSource: typeof raw.lastRunSource === "string" ? raw.lastRunSource : undefined,
    lastRunStatus: raw.lastRunStatus === "success" || raw.lastRunStatus === "failed" || raw.lastRunStatus === "running" ? raw.lastRunStatus : undefined,
    lastRunExitCode: typeof raw.lastRunExitCode === "number" ? raw.lastRunExitCode : undefined,
    lastRunError: typeof raw.lastRunError === "string" ? raw.lastRunError : undefined,
  }

  return job
}

export function normalizeJobRun(raw: unknown): JobRunSpec | undefined {
  if (!isRecord(raw)) return undefined

  const run: JobRunSpec = {}

  if (typeof raw.prompt === "string") run.prompt = raw.prompt
  if (typeof raw.command === "string") run.command = raw.command
  if (typeof raw.arguments === "string") run.arguments = raw.arguments

  if (Array.isArray(raw.files)) {
    run.files = raw.files.map((file) => String(file))
  }

  if (typeof raw.agent === "string") run.agent = raw.agent
  if (typeof raw.model === "string") run.model = raw.model
  if (typeof raw.variant === "string") run.variant = raw.variant
  if (typeof raw.title === "string") run.title = raw.title

  if (typeof raw.share === "boolean") run.share = raw.share
  if (typeof raw.continue === "boolean") run.continue = raw.continue
  if (typeof raw.session === "string") run.session = raw.session

  const runFormat = normalizeRunFormat(raw.runFormat)
  if (runFormat) run.runFormat = runFormat

  if (typeof raw.attachUrl === "string") run.attachUrl = raw.attachUrl

  if (typeof raw.port === "number" && Number.isFinite(raw.port)) {
    run.port = raw.port
  }

  return run
}

export function normalizeJobInvocation(raw: unknown): { command: string; args: string[] } | undefined {
  if (!isRecord(raw)) return undefined
  if (typeof raw.command !== "string") return undefined
  if (!Array.isArray(raw.args)) return undefined
  const command = raw.command.trim()
  if (!command) return undefined
  return { command, args: raw.args.map((v) => String(v)) }
}

export function normalizeRunFormat(value: unknown): "default" | "json" | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (trimmed === "json") return "json"
  if (trimmed === "default") return "default"
  return undefined
}

export function parseRunFormatInput(value: unknown): "default" | "json" | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string" && !value.trim()) return undefined
  const normalized = normalizeRunFormat(value)
  if (normalized) return normalized
  throw new Error(`Invalid runFormat: ${String(value)} (expected: default | json)`)
}

export function sanitizeJob(job: Job): Job {
  const sanitized: Job = { ...job }

  if (typeof sanitized.workdir === "string") {
    const trimmed = sanitized.workdir.trim()
    sanitized.workdir = trimmed ? trimmed : undefined
  }

  if (typeof sanitized.scopeId === "string") {
    const trimmed = sanitized.scopeId.trim()
    sanitized.scopeId = trimmed ? trimmed : undefined
  }

  if (!sanitized.scopeId) {
    sanitized.scopeId = deriveScopeId(sanitized.workdir || homedir())
  }

  if (sanitized.timeoutSeconds !== undefined) {
    const n = sanitized.timeoutSeconds
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      throw new Error("timeoutSeconds must be a non-negative integer")
    }
  }

  if (sanitized.invocation !== undefined) {
    const inv = sanitized.invocation as unknown
    if (!inv || typeof inv !== "object") {
      throw new Error("invocation must be an object")
    }
    const rec = inv as Record<string, unknown>
    if (typeof rec.command !== "string" || !Array.isArray(rec.args)) {
      throw new Error("invocation must have command and args")
    }
  }

  if (sanitized.run !== undefined) {
    const normalized = normalizeRunSpec(sanitized.run)
    validateRunSpec(normalized)
    sanitized.run = normalized
  }

  if (sanitized.attachUrl !== undefined) {
    sanitized.attachUrl = normalizeAttachUrl(sanitized.attachUrl)
  }

  if (sanitized.prompt !== undefined) {
    const trimmed = sanitized.prompt.trim()
    sanitized.prompt = trimmed ? trimmed : undefined
  }

  return sanitized
}

export function normalizeRunSpec(run: JobRunSpec): JobRunSpec {
  const normalized: JobRunSpec = { ...run }

  if (typeof normalized.prompt === "string") {
    const trimmed = normalized.prompt.trim()
    normalized.prompt = trimmed ? trimmed : undefined
  }

  if (typeof normalized.command === "string") {
    const trimmed = normalized.command.trim()
    normalized.command = trimmed ? trimmed : undefined
  }

  if (typeof normalized.arguments === "string") {
    const trimmed = normalized.arguments.trim()
    normalized.arguments = trimmed ? trimmed : undefined
  }

  if (Array.isArray(normalized.files)) {
    const files = normalized.files.map((file) => String(file).trim()).filter(Boolean)
    normalized.files = files.length ? files : undefined
  }

  if (typeof normalized.agent === "string") {
    const trimmed = normalized.agent.trim()
    normalized.agent = trimmed ? trimmed : undefined
  }

  if (typeof normalized.model === "string") {
    const trimmed = normalized.model.trim()
    normalized.model = trimmed ? trimmed : undefined
  }

  if (typeof normalized.variant === "string") {
    const trimmed = normalized.variant.trim()
    normalized.variant = trimmed ? trimmed : undefined
  }

  if (typeof normalized.title === "string") {
    const trimmed = normalized.title.trim()
    normalized.title = trimmed ? trimmed : undefined
  }

  if (normalized.share !== true) {
    normalized.share = undefined
  }

  if (normalized.continue !== true) {
    normalized.continue = undefined
  }

  if (typeof normalized.session === "string") {
    const trimmed = normalized.session.trim()
    normalized.session = trimmed ? trimmed : undefined
  }

  const runFormat = normalizeRunFormat(normalized.runFormat)
  if (runFormat) {
    normalized.runFormat = runFormat
  } else {
    normalized.runFormat = undefined
  }

  if (typeof normalized.attachUrl === "string") {
    const trimmed = normalized.attachUrl.trim()
    normalized.attachUrl = trimmed ? trimmed : undefined
  }

  if (typeof normalized.port === "number" && Number.isFinite(normalized.port)) {
    normalized.port = Math.floor(normalized.port)
    if (normalized.port <= 0) normalized.port = undefined
  } else {
    normalized.port = undefined
  }

  return normalized
}

export function validateRunSpec(run: JobRunSpec): void {
  const hasPrompt = typeof run.prompt === "string" && run.prompt.trim().length > 0
  const hasCommand = typeof run.command === "string" && run.command.trim().length > 0

  if (!hasPrompt && !hasCommand) {
    throw new Error("Job must have either run.prompt or run.command")
  }

  if (hasPrompt && hasCommand) {
    throw new Error("Job cannot specify both run.prompt and run.command")
  }

  if (hasCommand && run.arguments !== undefined && typeof run.arguments !== "string") {
    throw new Error("run.arguments must be a string")
  }

  if (run.attachUrl !== undefined) {
    normalizeAttachUrl(run.attachUrl)
  }

  if (run.port !== undefined) {
    if (!Number.isFinite(run.port) || run.port <= 0) {
      throw new Error("run.port must be a positive integer")
    }
  }

  if (run.runFormat !== undefined && run.runFormat !== "default" && run.runFormat !== "json") {
    throw new Error("run.runFormat must be 'default' or 'json'")
  }
}

export function normalizeAttachUrl(attachUrl?: string): string | undefined {
  if (attachUrl === undefined) return undefined
  const trimmed = attachUrl.trim()
  if (!trimmed) return undefined
  try {
    new URL(trimmed)
  } catch {
    throw new Error(`Invalid attach URL: ${attachUrl}`)
  }
  return trimmed
}

export function getJobRun(job: Job): JobRunSpec {
  if (job.run) {
    return job.run
  }

  const fallbackPrompt = (job.prompt ?? "").trim()
  if (!fallbackPrompt) {
    throw new Error(`Job "${job.slug}" is missing a prompt. Update the job to include run.prompt or prompt.`)
  }

  return {
    prompt: fallbackPrompt,
    attachUrl: job.attachUrl,
  }
}

export function findJobByName(
  name: string,
  options?: { scopeId?: string; allScopes?: boolean; includeLegacy?: boolean }
): Job | null {
  const scopeId = options?.scopeId ?? currentScopeId()
  const slug = slugify(name)

  let job = loadScopedJob(scopeId, slug) || loadScopedJob(scopeId, name)

  if (!job) {
    const allJobs = loadAllScopedJobs(scopeId)
    job =
      allJobs.find(
        (j) =>
          j.slug === name ||
          j.slug.endsWith(`-${slug}`) ||
          j.name.toLowerCase() === name.toLowerCase() ||
          j.name.toLowerCase().includes(name.toLowerCase())
      ) || null
  }

  if (!job && options?.allScopes) {
    const allJobs = loadAllJobsAcrossScopes()
    job =
      allJobs.find(
        (j) =>
          j.slug === name ||
          j.slug.endsWith(`-${slug}`) ||
          j.name.toLowerCase() === name.toLowerCase() ||
          j.name.toLowerCase().includes(name.toLowerCase())
      ) || null
  }

  if (!job && options?.includeLegacy) {
    job = loadLegacyJob(slug) || loadLegacyJob(name)
    if (!job) {
      const allJobs = loadAllLegacyJobs()
      job =
        allJobs.find(
          (j) =>
            j.slug === name ||
            j.slug.endsWith(`-${slug}`) ||
            j.name.toLowerCase() === name.toLowerCase() ||
            j.name.toLowerCase().includes(name.toLowerCase())
        ) || null
    }
  }

  return job
}

export function updateJobRecord(job: Job, updates: Partial<Job>): Job {
  const scopeId = job.scopeId || deriveScopeId(job.workdir || homedir())
  const latest = loadScopedJob(scopeId, job.slug) || job
  const updated: Job = {
    ...latest,
    ...updates,
    scopeId,
    updatedAt: new Date().toISOString(),
  }
  saveJob(updated)
  return updated
}

import { currentScopeId } from "./paths.js"
import { slugify } from "./utils.js"
