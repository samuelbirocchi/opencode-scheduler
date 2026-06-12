import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface PackageInfo {
  name: string
  version: string
}

export function getPackageInfo(): PackageInfo {
  const packageJsonPath = resolve(__dirname, "..", "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
  return {
    name: packageJson.name || "opencode-scheduler",
    version: packageJson.version || "0.0.0",
  }
}
