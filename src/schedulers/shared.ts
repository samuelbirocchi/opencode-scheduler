import { execFileSync, execSync } from "child_process"
import { existsSync } from "fs"
import { dirname } from "path"
import { homedir } from "os"

export function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export function findOpencode(): string {
  try {
    const result = execFileSync("which", ["opencode"], { encoding: "utf-8" }).trim()
    if (result) return result
  } catch {}

  const candidates = [
    resolve(homedir(), ".local", "bin", "opencode"),
    resolve(homedir(), ".bun", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return "opencode"
}

export function getEnhancedPath(): string {
  const opencodePath = findOpencode()
  const opencodeDir = dirname(opencodePath)
  const existingPath = process.env.PATH || ""

  if (existingPath.includes(opencodeDir)) {
    return existingPath
  }

  return `${opencodeDir}${existingPath ? `:${existingPath}` : ""}`
}

export function buildRunEnvironment(): NodeJS.ProcessEnv {
  const enhancedPath = getEnhancedPath()
  const existingPath = process.env.PATH
  const combinedPath = existingPath ? `${enhancedPath}:${existingPath}` : enhancedPath

  const basePolicy: Record<string, unknown> = { question: "deny" }

  const mergedPolicy = (() => {
    const raw = process.env.OPENCODE_PERMISSION
    if (!raw) return basePolicy
    try {
      const existing = JSON.parse(raw) as unknown
      if (isRecord(existing)) {
        return { ...existing, ...basePolicy }
      }
    } catch {}
    return basePolicy
  })()

  const baseEnv: NodeJS.ProcessEnv = { ...process.env }
  const config = loadSchedulerConfig()
  const preserveOpencodeEnv = config.env?.preserveOpencodeEnv === true
  const preserved = new Set(["OPENCODE_PERMISSION", ...(config.env?.preserve ?? [])])

  if (!preserveOpencodeEnv) {
    for (const key of Object.keys(baseEnv)) {
      if (!key.startsWith("OPENCODE_")) continue
      if (key.startsWith("OPENCODE_SCHEDULER_")) continue
      if (preserved.has(key)) continue
      delete baseEnv[key]
    }
  }

  return {
    ...baseEnv,
    ...config.env?.set,
    PATH: combinedPath,
    OPENCODE_PERMISSION: JSON.stringify(mergedPolicy),
  }
}

export function getOpencodeVersion(opencodePath: string): string | null {
  try {
    const output = execSync(`"${opencodePath}" --version`, { env: buildRunEnvironment() })
      .toString()
      .trim()
    return output || null
  } catch {
    return null
  }
}

export function loadSchedulerConfig(): { env?: { preserveOpencodeEnv?: boolean; preserve?: string[]; set?: Record<string, string> } } {
  if (!existsSync(SCHEDULER_CONFIG)) return {}
  try {
    const raw = readFileSync(SCHEDULER_CONFIG, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return {}
    return parsed as { env?: { preserveOpencodeEnv?: boolean; preserve?: string[]; set?: Record<string, string> } }
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

import { resolve } from "path"
import { readFileSync } from "fs"
import { SCHEDULER_CONFIG } from "../constants.js"
