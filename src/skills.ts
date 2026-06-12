import type { BuiltinSkill } from "./types.js"

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: "scheduled-job-best-practices",
    description: "Best practices for creating reliable scheduled jobs with opencode",
    suggestedPath: ".opencode/skills/scheduled-job-best-practices.md",
    files: {
      "scheduled-job-best-practices.md": `# Scheduled Job Best Practices

## Overview
This skill helps you create reliable, maintainable scheduled jobs using the opencode scheduler.

## Guidelines

### 1. Use Descriptive Names
Choose clear, descriptive names for your jobs:
- Good: "daily-standup-summary", "weekly-code-review"
- Bad: "job1", "task2"

### 2. Set Appropriate Schedules
- Use cron expressions that match your actual needs
- Avoid overly frequent schedules (e.g., every minute)
- Consider timezone implications

### 3. Handle Failures Gracefully
- Jobs should be idempotent when possible
- Use timeout settings to prevent hung jobs
- Monitor job logs regularly

### 4. Working Directory
- Always specify a working directory for file-based operations
- Use absolute paths or ensure the working directory is correct

### 5. Environment Variables
- Use the scheduler config to set environment variables
- Be careful with sensitive data in job definitions

## Example Jobs

### Daily Summary
\`\`\`
schedule_job(
  name: "daily-summary",
  schedule: "0 9 * * *",
  prompt: "Generate a daily summary of yesterday's commits and PRs"
)
\`\`\`

### Weekly Report
\`\`\`
schedule_job(
  name: "weekly-report",
  schedule: "0 17 * * 5",
  prompt: "Create a weekly progress report for the team"
)
\`\`\`
`,
    },
  },
]

export function getBuiltinSkill(name?: string): BuiltinSkill | undefined {
  const skillName = (name || "scheduled-job-best-practices").trim()
  return BUILTIN_SKILLS.find((s) => s.name === skillName)
}

export function listBuiltinSkills(): BuiltinSkill[] {
  return [...BUILTIN_SKILLS]
}
