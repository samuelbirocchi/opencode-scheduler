import type { LaunchdCalendar, WindowsTaskPlan } from "./types.js"

export function parseCronExpression(cron: string): {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
} {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${cron}": expected 5 fields (minute hour day month weekday)`)
  }
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  }
}

export function validateCronExpression(cron: string): void {
  parseCronExpression(cron)
}

export function cronToLaunchdCalendars(cron: string): LaunchdCalendar[] {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCronExpression(cron)
  const calendars: LaunchdCalendar[] = []

  if (minute === "*" && hour === "*") {
    calendars.push({ Minute: "0" })
  } else {
    const cal: LaunchdCalendar = {}
    if (minute !== "*") cal.Minute = minute
    if (hour !== "*") cal.Hour = hour
    if (dayOfMonth !== "*") cal.Day = dayOfMonth
    if (month !== "*") cal.Month = month
    if (dayOfWeek !== "*") cal.Weekday = dayOfWeek
    calendars.push(cal)
  }

  return calendars
}

export function renderLaunchdCalendar(calendar: LaunchdCalendar): string {
  const entries: string[] = []
  if (calendar.Minute !== undefined) entries.push(`    <key>Minute</key>\n    <integer>${calendar.Minute}</integer>`)
  if (calendar.Hour !== undefined) entries.push(`    <key>Hour</key>\n    <integer>${calendar.Hour}</integer>`)
  if (calendar.Day !== undefined) entries.push(`    <key>Day</key>\n    <integer>${calendar.Day}</integer>`)
  if (calendar.Weekday !== undefined) entries.push(`    <key>Weekday</key>\n    <integer>${calendar.Weekday}</integer>`)
  if (calendar.Month !== undefined) entries.push(`    <key>Month</key>\n    <integer>${calendar.Month}</integer>`)
  return entries.join("\n")
}

export function cronToSystemdCalendars(cron: string): string[] {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCronExpression(cron)
  const parts: string[] = []

  if (minute !== "*") parts.push(minute)
  if (hour !== "*") parts.push(hour)
  if (dayOfMonth !== "*") parts.push(dayOfMonth)
  if (month !== "*") parts.push(month)
  if (dayOfWeek !== "*") parts.push(dayOfWeek)

  return [parts.join(" ")]
}

export function ensureWindowsRepresentable(cron: string): WindowsTaskPlan[] {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCronExpression(cron)
  const plans: WindowsTaskPlan[] = []

  if (month !== "*" || dayOfMonth !== "*") {
    throw new Error(
      `Cron "${cron}" uses month/day-of-month restrictions not supported by Windows Task Scheduler. Use weekday-only or daily schedules.`
    )
  }

  if (dayOfWeek === "*") {
    if (hour.includes("/") || minute.includes("/")) {
      const hourInterval = hour.includes("/") ? parseInt(hour.split("/")[1]) : 1
      const minInterval = minute.includes("/") ? parseInt(minute.split("/")[1]) : 1
      if (hourInterval * minInterval < 60) {
        throw new Error(
          `Cron "${cron}" is too frequent for Windows Task Scheduler (minimum interval is 1 minute).`
        )
      }
    }

    const plan: WindowsTaskPlan = { schedule: "DAILY", startTime: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` }
    if (hour.startsWith("*/")) {
      plan.schedule = "HOURLY"
      plan.modifier = hour.slice(2)
    } else if (minute.startsWith("*/")) {
      plan.schedule = "MINUTE"
      plan.modifier = minute.slice(2)
    }
    plans.push(plan)
  } else {
    const weekdays = dayOfWeek.split(",").map((d) => {
      const n = parseInt(d)
      if (isNaN(n) || n < 0 || n > 6) {
        throw new Error(`Invalid weekday "${d}" in cron "${cron}"`)
      }
      return n + 1
    })

    const plan: WindowsTaskPlan = {
      schedule: "WEEKLY",
      weekdays: weekdays.join(","),
      startTime: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
    }
    plans.push(plan)
  }

  return plans
}

export function describeCron(cron: string): string {
  const parts = cron.split(" ")
  if (parts.length !== 5) return cron

  const [min, hour, dom, mon, dow] = parts

  if (mon === "*" && dom === "*") {
    if (dow === "*" && hour !== "*" && min !== "*" && !hour.includes("*") && !hour.includes("/")) {
      const h = parseInt(hour)
      const m = parseInt(min)
      const ampm = h >= 12 ? "PM" : "AM"
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
      return `daily at ${displayH}:${m.toString().padStart(2, "0")} ${ampm}`
    }
    if (hour.startsWith("*/")) {
      return `every ${hour.slice(2)} hours`
    }
    if (min.startsWith("*/")) {
      return `every ${min.slice(2)} minutes`
    }
    if (dow !== "*") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const dayNames = dow.split(",").map((d) => days[parseInt(d)]).join(", ")
      return `weekly on ${dayNames}`
    }
  }

  return cron
}
