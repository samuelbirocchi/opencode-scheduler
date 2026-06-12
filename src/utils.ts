import { createHash } from "crypto"
import { existsSync, mkdirSync, readdirSync } from "fs"
import { join } from "path"

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort()
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function listDirectoryFiles(
  dir: string,
  options?: { prefix?: string; suffix?: string }
): string[] {
  if (!existsSync(dir)) return []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => (options?.prefix ? name.startsWith(options.prefix) : true))
      .filter((name) => (options?.suffix ? name.endsWith(options.suffix) : true))
      .map((name) => join(dir, name))
      .sort()
  } catch {
    return []
  }
}

export function listDirectoryNames(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

export function deriveScopeId(workdir: string): string {
  return createHash("sha256").update(workdir).digest("hex").slice(0, 16)
}
