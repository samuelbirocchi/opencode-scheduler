import { existsSync, unlinkSync } from "fs"
import { join } from "path"
import { platform } from "os"
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { LEGACY_JOBS_DIR } from "./constants.js"
import type { Job, OpencodeRunFormat } from "./types.js"
import { deriveScopeId, slugify } from "./utils.js"
import { currentScopeId, getLogPath, normalizeWorkdirPath } from "./paths.js"
import { validateCronExpression, describeCron } from "./cron.js"
import { getPackageInfo } from "./package-info.js"
import { getBuiltinSkill, listBuiltinSkills } from "./skills.js"
import { installJob, resolveSchedulerBackend, uninstallJob } from "./schedulers/index.js"
import { findOpencode, getOpencodeVersion } from "./schedulers/shared.js"
import {
  deleteJobFile,
  findJobByName,
  getJobRun,
  loadAllJobsAcrossScopes,
  loadAllLegacyJobs,
  loadAllScopedJobs,
  loadLegacyJob,
  loadScopedJob,
  normalizeAttachUrl,
  normalizeRunSpec,
  normalizeRunFormat,
  parseRunFormatInput,
  saveJob,
  sanitizeJob,
  updateJobRecord,
  validateRunSpec,
} from "./storage.js"
import { buildGlobalCleanupPlan, executeGlobalCleanup, formatGlobalCleanupOutput } from "./cleanup.js"
import { buildOpencodeArgs, runJobNow } from "./execution.js"
import { errorResult, formatJobDetails, getJobLogs, normalizeFormat, okResult } from "./helpers.js"

export const SchedulerPlugin: Plugin = async () => {
  return {
    tool: {
      schedule_job: tool({
        description:
          "Schedule a recurring job to run an opencode prompt. Uses launchd (Mac), systemd (Linux), Windows Task Scheduler, or cron fallback when needed.",
        args: {
          name: tool.schema.string().describe("A short name for the job (e.g. 'standing desk search')"),
          schedule: tool.schema
            .string()
            .describe("Cron expression: '0 9 * * *' (daily 9am), '0 */6 * * *' (every 6h), '30 8 * * 1' (Monday 8:30am)"),
          prompt: tool.schema.string().optional().describe("Prompt to run (legacy; prefer run fields)"),
          command: tool.schema.string().optional().describe("Optional: opencode command to run (maps to --command)"),
          arguments: tool.schema.string().optional().describe("Optional: arguments string for command mode"),
          files: tool.schema
            .string()
            .optional()
            .describe("Optional: comma-separated list of files/dirs to attach (maps to repeated --file)"),
          agent: tool.schema.string().optional().describe("Optional: agent to use (maps to --agent)"),
          model: tool.schema.string().optional().describe("Optional: model to use (maps to --model)"),
          variant: tool.schema.string().optional().describe("Optional: model variant (maps to --variant)"),
          title: tool.schema.string().optional().describe("Optional: session title (maps to --title)"),
          share: tool.schema.boolean().optional().describe("Optional: share flag (maps to --share)"),
          continue: tool.schema.boolean().optional().describe("Optional: continue flag (maps to --continue)"),
          session: tool.schema.string().optional().describe("Optional: session id (maps to --session)"),
          runFormat: tool.schema
            .string()
            .optional()
            .describe("Optional: run output format (default|json)"),
          port: tool.schema.number().optional().describe("Optional: port (maps to --port)"),
          attachUrl: tool.schema.string().optional().describe("Optional: attach URL (maps to --attach)"),
          timeoutSeconds: tool.schema.number().optional().describe("Optional: timeout in seconds (0 disables)"),
          workdir: tool.schema.string().optional().describe("Optional: working directory (defaults to current directory)"),
          source: tool.schema.string().optional().describe("Optional: source app identifier"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },

        async execute(args) {
          const format = normalizeFormat(args.format)
          const workdir = normalizeWorkdirPath(args.workdir || process.cwd())
          const scopeId = deriveScopeId(workdir)
          const slug = slugify(args.name)
          const platformName = resolveSchedulerBackend()

          if (loadScopedJob(scopeId, slug) || loadLegacyJob(slug)) {
            return errorResult(format, `A job named "${args.name}" already exists. Delete it first or choose a different name.`)
          }

          let attachUrl: string | undefined
          try {
            attachUrl = normalizeAttachUrl(args.attachUrl)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, msg)
          }

          const attachLine = attachUrl ? `Attach URL: ${attachUrl}\n` : ""

          try {
            validateCronExpression(args.schedule)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Invalid cron schedule: ${msg}`)
          }

          const parseFiles = (raw?: unknown): string[] | undefined => {
            if (raw === undefined) return undefined
            if (typeof raw !== "string") return undefined
            const items = raw
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
            return items.length ? items : undefined
          }

          let runFormat: OpencodeRunFormat | undefined
          try {
            runFormat = parseRunFormatInput(args.runFormat)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, msg)
          }

          const run: Job["run"] = {
            prompt: args.prompt,
            command: args.command,
            arguments: args.arguments,
            files: parseFiles(args.files),
            agent: args.agent,
            model: args.model,
            variant: args.variant,
            title: args.title,
            share: args.share,
            continue: args.continue,
            session: args.session,
            runFormat,
            attachUrl: args.attachUrl,
            port: args.port,
          }

          try {
            validateRunSpec(normalizeRunSpec(run))
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Invalid run spec: ${msg}`)
          }

          const job: Job = {
            scopeId,
            slug,
            name: args.name,
            schedule: args.schedule,
            run: normalizeRunSpec(run),
            prompt: args.prompt,
            source: args.source,
            workdir,
            attachUrl,
            timeoutSeconds: args.timeoutSeconds,
            createdAt: new Date().toISOString(),
          }

          try {
            job.invocation = buildOpencodeArgs(job)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Failed to build invocation: ${msg}`)
          }

          try {
            saveJob(job)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Failed to save job: ${msg}`)
          }

          try {
            installJob(job)
          } catch (error) {
            deleteJobFile(job)
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Failed to schedule job: ${msg}`)
          }

          const primaryLine = run.command
            ? `Command: ${run.command}${run.arguments ? ` ${run.arguments}` : ""}`
            : `Prompt: ${run.prompt ?? ""}`

          const reliabilityLine = platformName === "cron"
            ? "Note: Using cron fallback. For better reliability, ensure systemd --user is available."
            : `Platform: ${platformName}`

          return okResult(
            format,
            `Scheduled "${args.name}"

Schedule: ${args.schedule} (${describeCron(args.schedule)})
Platform: ${platformName}
Working Directory: ${workdir}
${attachLine}${primaryLine}

${reliabilityLine}

Commands:
- "run ${args.name} now" - run immediately
- "show my jobs" - list all
- "delete job ${args.name}" - remove`,
            { job }
          )
        },
      }),

      list_jobs: tool({
        description: "List all scheduled jobs. Optionally filter by source app.",
        args: {
          source: tool.schema.string().optional().describe("Filter by source app (e.g. 'marketplace')"),
          allScopes: tool.schema.boolean().optional().describe("List jobs across all scopes."),
          includeLegacy: tool.schema.boolean().optional().describe("Include legacy jobs from ~/.config/opencode/jobs"),
          scopeRoot: tool.schema
            .string()
            .optional()
            .describe("Optional: scope root directory (defaults to current directory)."),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },

        async execute(args) {
          const format = normalizeFormat(args.format)

          const scopeId = args.allScopes
            ? undefined
            : deriveScopeId(normalizeWorkdirPath(args.scopeRoot || process.cwd()))

          let jobs = args.allScopes ? loadAllJobsAcrossScopes() : loadAllScopedJobs(scopeId!)

          if (args.includeLegacy) {
            jobs = [...jobs, ...loadAllLegacyJobs()]
          }

          if (args.source) {
            jobs = jobs.filter((j) => j.source === args.source || j.slug.startsWith(`${args.source}-`))
          }

          if (jobs.length === 0) {
            const message = args.source
              ? `No jobs found for "${args.source}".`
              : 'No scheduled jobs yet.\n\nTry: "Schedule a daily job at 9am to search for standing desks"'
            return okResult(format, message, { jobs: [] })
          }

          const lines = jobs.map((j, i) => {
            const run = (() => {
              try {
                return normalizeRunSpec(getJobRun(j))
              } catch {
                return undefined
              }
            })()

            const preview = run?.command
              ? `${run.command}${run.arguments ? ` ${run.arguments}` : ""}`
              : (run?.prompt ?? j.prompt ?? "")

            const status = j.lastRunStatus
              ? ` [${j.lastRunStatus}${j.lastRunExitCode !== undefined ? `:${j.lastRunExitCode}` : ""}]`
              : ""

            return `${i + 1}. ${j.name} (${j.schedule})${status}\n   ${preview.slice(0, 60)}${preview.length > 60 ? "..." : ""}`
          })

          return okResult(format, lines.join("\n\n"), { jobs })
        },
      }),

      get_job: tool({
        description: "Get details for a scheduled job",
        args: {
          name: tool.schema.string().describe("The job name or slug"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const job = findJobByName(args.name)

          if (!job) {
            return errorResult(format, `Job "${args.name}" not found.`)
          }

          return okResult(format, formatJobDetails(job), { job })
        },
      }),

      update_job: tool({
        description: "Update a scheduled job",
        args: {
          name: tool.schema.string().describe("The job name or slug"),
          schedule: tool.schema.string().optional().describe("Updated cron expression"),
          prompt: tool.schema.string().optional().describe("Updated prompt (legacy; prefer command/arguments/etc)"),
          command: tool.schema.string().optional().describe("Updated opencode command (maps to --command)"),
          arguments: tool.schema.string().optional().describe("Updated command arguments string"),
          files: tool.schema
            .string()
            .optional()
            .describe("Updated comma-separated list of files/dirs to attach"),
          agent: tool.schema.string().optional().describe("Updated agent (maps to --agent)"),
          model: tool.schema.string().optional().describe("Updated model (maps to --model)"),
          variant: tool.schema.string().optional().describe("Updated model variant (maps to --variant)"),
          title: tool.schema.string().optional().describe("Updated session title (maps to --title)"),
          share: tool.schema.boolean().optional().describe("Updated share flag (maps to --share)"),
          continue: tool.schema.boolean().optional().describe("Updated continue flag (maps to --continue)"),
          session: tool.schema.string().optional().describe("Updated session id (maps to --session)"),
          runFormat: tool.schema
            .string()
            .optional()
            .describe("Updated run output format (default|json)"),
          port: tool.schema.number().optional().describe("Updated port (maps to --port)"),
          timeoutSeconds: tool.schema.number().optional().describe("Updated timeout in seconds (0 disables)"),
          workdir: tool.schema.string().optional().describe("Updated working directory"),
          attachUrl: tool.schema.string().optional().describe("Updated attach URL"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const job = findJobByName(args.name)

          if (!job) {
            return errorResult(format, `Job "${args.name}" not found.`)
          }

          const updates: Partial<Job> = {}

          const currentRun = (() => {
            try {
              return normalizeRunSpec(getJobRun(job))
            } catch {
              return {}
            }
          })()

          const parseFiles = (raw?: unknown): string[] | undefined => {
            if (raw === undefined) return undefined
            if (typeof raw !== "string") return undefined
            const items = raw
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
            return items.length ? items : undefined
          }

          const nextRunCandidate: Job["run"] = {
            prompt: args.prompt !== undefined ? args.prompt : currentRun.prompt,
            command: args.command !== undefined ? args.command : currentRun.command,
            arguments: args.arguments !== undefined ? args.arguments : currentRun.arguments,
            files: args.files !== undefined ? parseFiles(args.files) : currentRun.files,
            agent: args.agent !== undefined ? args.agent : currentRun.agent,
            model: args.model !== undefined ? args.model : currentRun.model,
            variant: args.variant !== undefined ? args.variant : currentRun.variant,
            title: args.title !== undefined ? args.title : currentRun.title,
            share: args.share !== undefined ? args.share : currentRun.share,
            continue: args.continue !== undefined ? args.continue : currentRun.continue,
            session: args.session !== undefined ? args.session : currentRun.session,
            runFormat: args.runFormat !== undefined ? parseRunFormatInput(args.runFormat) : currentRun.runFormat,
            attachUrl: args.attachUrl !== undefined ? args.attachUrl : currentRun.attachUrl,
            port: args.port !== undefined ? args.port : currentRun.port,
          }

          try {
            updates.run = normalizeRunSpec(nextRunCandidate)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Invalid run spec: ${msg}`)
          }

          if (args.schedule !== undefined) {
            if (!args.schedule.trim()) {
              return errorResult(format, "Schedule cannot be empty.")
            }
            try {
              validateCronExpression(args.schedule)
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              return errorResult(format, `Invalid cron schedule: ${msg}`)
            }
            updates.schedule = args.schedule
          }

          if (args.prompt !== undefined) {
            if (!args.prompt.trim()) {
              return errorResult(format, "Prompt cannot be empty.")
            }
            updates.prompt = args.prompt
          }

          if (args.workdir !== undefined) {
            if (!args.workdir.trim()) {
              return errorResult(format, "Working directory cannot be empty.")
            }
            const normalizedWorkdir = normalizeWorkdirPath(args.workdir)
            updates.workdir = normalizedWorkdir
            updates.scopeId = deriveScopeId(normalizedWorkdir)
          }

          if (args.attachUrl !== undefined) {
            try {
              updates.attachUrl = normalizeAttachUrl(args.attachUrl)
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              return errorResult(format, msg)
            }
          }

          if (args.timeoutSeconds !== undefined) {
            updates.timeoutSeconds = args.timeoutSeconds
          }

          if (Object.keys(updates).length === 0) {
            return errorResult(format, "No updates provided.")
          }

          const updatedJob: Job = {
            ...job,
            ...updates,
            updatedAt: new Date().toISOString(),
          }

          try {
            updatedJob.invocation = buildOpencodeArgs(updatedJob)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Failed to build invocation: ${msg}`)
          }

          try {
            saveJob(updatedJob)
            installJob(updatedJob)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            try {
              saveJob(job)
              installJob(job)
            } catch {}
            return errorResult(format, `Failed to update job: ${msg}`)
          }

          return okResult(format, `Updated job "${updatedJob.name}"`, { job: updatedJob })
        },
      }),

      delete_job: tool({
        description: "Delete a scheduled job",
        args: {
          name: tool.schema.string().describe("The job name or slug to delete"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const job = findJobByName(args.name)

          if (!job) {
            return errorResult(format, `Job "${args.name}" not found.`)
          }

          uninstallJob(job)
          deleteJobFile(job)

          const legacyPath = join(LEGACY_JOBS_DIR, `${job.slug}.json`)
          if (existsSync(legacyPath)) {
            try {
              unlinkSync(legacyPath)
            } catch {}
          }

          return okResult(format, `Deleted job "${job.name}"`, { job })
        },
      }),

      cleanup_global: tool({
        description:
          "Clean up scheduler artifacts globally across all scopes. Removes job definitions everywhere; optionally remove logs and run history.",
        args: {
          includeHistory: tool.schema
            .boolean()
            .optional()
            .describe("Also remove run history and logs across all scopes (default false)."),
          confirm: tool.schema
            .boolean()
            .optional()
            .describe("Set true to execute deletion. Default is dry run with no destructive changes."),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const includeHistory = args.includeHistory === true
          const dryRun = args.confirm !== true

          const plan = buildGlobalCleanupPlan(includeHistory)
          const execution = executeGlobalCleanup(plan, { dryRun, includeHistory })
          const output = formatGlobalCleanupOutput(execution)

          return okResult(format, output, {
            dryRun: execution.dryRun,
            includeHistory: execution.includeHistory,
            removed: execution.removed,
            errors: execution.errors,
            scopeIds: plan.scopeIds,
            jobsConsidered: plan.jobsToUninstall.length,
          })
        },
      }),

      run_job: tool({
        description: "Run a scheduled job immediately",
        args: {
          name: tool.schema.string().describe("The job name or slug to run"),
          prompt: tool.schema.string().optional().describe("Override prompt for this run"),
          command: tool.schema.string().optional().describe("Override command for this run"),
          arguments: tool.schema.string().optional().describe("Override arguments for this run"),
          files: tool.schema.string().optional().describe("Override files for this run"),
          agent: tool.schema.string().optional().describe("Override agent for this run"),
          model: tool.schema.string().optional().describe("Override model for this run"),
          variant: tool.schema.string().optional().describe("Override variant for this run"),
          title: tool.schema.string().optional().describe("Override title for this run"),
          share: tool.schema.boolean().optional().describe("Override share for this run"),
          continue: tool.schema.boolean().optional().describe("Override continue for this run"),
          session: tool.schema.string().optional().describe("Override session for this run"),
          runFormat: tool.schema.string().optional().describe("Override runFormat for this run"),
          port: tool.schema.number().optional().describe("Override port for this run"),
          attachUrl: tool.schema.string().optional().describe("Override attachUrl for this run"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const job = findJobByName(args.name)

          if (!job) {
            return errorResult(format, `Job "${args.name}" not found.`)
          }

          const parseFiles = (raw?: unknown): string[] | undefined => {
            if (raw === undefined) return undefined
            if (typeof raw !== "string") return undefined
            const items = raw
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
            return items.length ? items : undefined
          }

          const baseRun = (() => {
            try {
              return normalizeRunSpec(getJobRun(job))
            } catch {
              return {}
            }
          })()

          const overrideCandidate: Job["run"] = {
            ...baseRun,
            prompt: args.prompt !== undefined ? args.prompt : baseRun.prompt,
            command: args.command !== undefined ? args.command : baseRun.command,
            arguments: args.arguments !== undefined ? args.arguments : baseRun.arguments,
            files: args.files !== undefined ? parseFiles(args.files) : baseRun.files,
            agent: args.agent !== undefined ? args.agent : baseRun.agent,
            model: args.model !== undefined ? args.model : baseRun.model,
            variant: args.variant !== undefined ? args.variant : baseRun.variant,
            title: args.title !== undefined ? args.title : baseRun.title,
            share: args.share !== undefined ? args.share : baseRun.share,
            continue: args.continue !== undefined ? args.continue : baseRun.continue,
            session: args.session !== undefined ? args.session : baseRun.session,
            runFormat: args.runFormat !== undefined ? parseRunFormatInput(args.runFormat) : baseRun.runFormat,
            port: args.port !== undefined ? args.port : baseRun.port,
            attachUrl: args.attachUrl !== undefined ? args.attachUrl : baseRun.attachUrl,
          }

          let runOverride: Job["run"]
          try {
            runOverride = normalizeRunSpec(overrideCandidate)
            validateRunSpec(runOverride)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Invalid run override: ${msg}`)
          }

          const runJob: Job = {
            ...job,
            run: runOverride,
          }

          let runResult
          try {
            runResult = runJobNow(runJob)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            return errorResult(format, `Failed to start job "${job.name}": ${msg}`)
          }

          const logs = getJobLogs(runJob)
          const attachHint = runOverride.attachUrl ? `\nAttach: opencode attach ${runOverride.attachUrl}` : ""
          const logHint = logs ? `\n\nRecent logs:\n${logs.slice(0, 500)}${logs.length > 500 ? "..." : ""}` : ""

          return okResult(
            format,
            `Started "${job.name}" (pid: ${runResult.pid ?? "unknown"})${attachHint}${logHint}`,
            { job: runResult.job, logPath: runResult.logPath }
          )
        },
      }),

      get_logs: tool({
        description: "Get logs for a scheduled job",
        args: {
          name: tool.schema.string().describe("The job name or slug"),
          tailLines: tool.schema.number().optional().describe("Number of lines to tail (default: all, max: 5000)"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const job = findJobByName(args.name)

          if (!job) {
            return errorResult(format, `Job "${args.name}" not found.`)
          }

          const logs = getJobLogs(job, { tailLines: args.tailLines })
          const logPath = getLogPath(job)

          if (!logs) {
            return okResult(format, `No logs found for "${job.name}". The job may not have run yet.`, {
              job,
              logPath,
              logs: "",
            })
          }

          return okResult(format, `Logs for ${job.name}\n\n${logs}`, { job, logPath, logs })
        },
      }),

      get_skill: tool({
        description: "Get built-in skill templates to copy into your project.",
        args: {
          name: tool.schema
            .string()
            .optional()
            .describe("Skill name (default: scheduled-job-best-practices)"),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const skill = getBuiltinSkill(args.name)

          if (!skill) {
            const available = listBuiltinSkills()
              .map((s) => s.name)
              .join(", ")
            const requested = (args.name ?? "").trim()
            const label = requested ? `"${requested}"` : "that name"
            return errorResult(format, `No built-in skill found for ${label}. Available: ${available || "(none)"}`)
          }

          const renderedFiles = Object.entries(skill.files)
            .map(([filename, content]) => `--- ${filename} ---\n${content.trim()}\n`)
            .join("\n")

          const output = [
            `Skill: ${skill.name}`,
            `Description: ${skill.description}`,
            `Suggested path: ${skill.suggestedPath}`,
            "",
            "Copy the file(s) below into your repo:",
            "",
            renderedFiles,
          ].join("\n")

          return okResult(format, output, { skill })
        },
      }),

      install_skill: tool({
        description: "Install a built-in skill into your repo's .opencode/skill directory.",
        args: {
          name: tool.schema
            .string()
            .optional()
            .describe("Skill name (default: scheduled-job-best-practices)"),
          directory: tool.schema
            .string()
            .optional()
            .describe("Repo root directory to install into (defaults to current directory)."),
          overwrite: tool.schema.boolean().optional().describe("Overwrite existing files (default false)."),
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const skill = getBuiltinSkill(args.name)

          if (!skill) {
            const available = listBuiltinSkills()
              .map((s) => s.name)
              .join(", ")
            const requested = (args.name ?? "").trim()
            const label = requested ? `"${requested}"` : "that name"
            return errorResult(format, `No built-in skill found for ${label}. Available: ${available || "(none)"}`)
          }

          const dir = normalizeWorkdirPath(args.directory || process.cwd())
          const skillDir = join(dir, ".opencode", "skills")
          ensureDir(skillDir)

          const installed: string[] = []
          const skipped: string[] = []

          for (const [filename, content] of Object.entries(skill.files)) {
            const filePath = join(skillDir, filename)
            if (existsSync(filePath) && !args.overwrite) {
              skipped.push(filename)
              continue
            }
            writeFileSync(filePath, content)
            installed.push(filename)
          }

          const lines = [
            `Installed skill: ${skill.name}`,
            `Location: ${skillDir}`,
          ]

          if (installed.length > 0) {
            lines.push(`Created: ${installed.join(", ")}`)
          }

          if (skipped.length > 0) {
            lines.push(`Skipped (exists): ${skipped.join(", ")}`)
          }

          return okResult(format, lines.join("\n"), { skill, installed, skipped })
        },
      }),

      scheduler_status: tool({
        description: "Get scheduler plugin status and version info",
        args: {
          format: tool.schema.string().optional().describe("Optional: output format ('text' or 'json')."),
        },
        async execute(args) {
          const format = normalizeFormat(args.format)
          const packageInfo = getPackageInfo()
          const opencodePath = findOpencode()
          const opencodeVersion = getOpencodeVersion(opencodePath)

          const lines = [
            `Scheduler Plugin: ${packageInfo.name}@${packageInfo.version}`,
            `Opencode Binary: ${opencodePath}`,
            `Opencode Version: ${opencodeVersion ?? "unknown"}`,
          ]

          return okResult(format, lines.join("\n"), {
            plugin: packageInfo,
            opencode: { path: opencodePath, version: opencodeVersion },
            platform: platform(),
          })
        },
      }),
    },
  }
}

import { ensureDir } from "./utils.js"
import { writeFileSync } from "fs"
