import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { currentLanguage } from "@/i18n"
import { parseHex } from "@/lib/colors"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "rgba(r, g, b, alpha)" for a "#rgb" or "#rrggbb" color.
 * @returns `hex` itself when empty or missing; undefined when it is not a hex color (before, a garbage "rgba(NaN, ...)" the browser ignored).
 */
export function hexToRgba(alpha: number, hex?: string) {
  if (!hex) return hex
  const rgb = parseHex(hex)
  if (!rgb) return undefined
  const [r, g, b] = rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const STORED_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

/** Parses a stored "YYYY-MM-DD" or "YYYY-MM-DD HH:MM[:SS]" (local time, no timezone) as a local date; null when it is not one. */
function parseStoredDate(value: string): Date | null {
  const match = STORED_DATE.exec(value)
  if (!match) return null
  const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1).map(part => Number(part ?? 0))
  const date = new Date(year, month - 1, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" }
const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { ...DATE_FORMAT, hour: "2-digit", minute: "2-digit", second: "2-digit" }

/** Formats a stored "YYYY-MM-DD" date in the current language ("DD/MM/YYYY" in Italian, "MM/DD/YYYY" in English); a value that is not a date comes back as it is. */
export function formatDate(dateStr: string) {
  if (!dateStr) return ""
  const date = parseStoredDate(dateStr)
  if (!date) return dateStr
  return new Intl.DateTimeFormat(currentLanguage(), DATE_FORMAT).format(date)
}

/** Formats a date and time in the current language. Takes a Date, a timestamp in milliseconds or a stored "YYYY-MM-DD HH:MM[:SS]" (local time). */
export function formatDateTime(value: Date | number | string) {
  const date = typeof value === "string" ? parseStoredDate(value) : new Date(value)
  if (!date || Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(currentLanguage(), DATE_TIME_FORMAT).format(date)
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message)
  return String(err)
}
