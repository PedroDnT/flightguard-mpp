import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs'

const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH ?? 'audit.json'

export interface AuditLogEntry {
  timestamp: string
  event: string
  details: Record<string, any>
  ip?: string
  userAgent?: string
}

export type AuditEvent =
  | 'policy_created'
  | 'payment_received'
  | 'payout_triggered'
  | 'payout_sent'
  | 'payout_failed'
  | 'policy_expired'
  | 'policy_cancelled'
  | 'admin_login'
  | 'admin_logout'
  | 'admin_action'
  | 'pool_balance_checked'

class AuditLogger {
  private logPath: string
  private formatChecked = false

  constructor(logPath: string = AUDIT_LOG_PATH) {
    this.logPath = logPath
  }

  private parseLogs(raw: string): AuditLogEntry[] {
    const trimmed = raw.trim()
    if (!trimmed) return []

    // Backward compatibility: older format stored a JSON array.
    if (trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as AuditLogEntry[]
    }

    // New format: append-only JSONL (one JSON object per line).
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditLogEntry)
  }

  private ensureAppendOnlyFormat(): void {
    if (this.formatChecked) return
    this.formatChecked = true

    try {
      if (!existsSync(this.logPath)) return

      const raw = readFileSync(this.logPath, 'utf-8').trim()
      if (!raw || !raw.startsWith('[')) return

      const logs = JSON.parse(raw) as AuditLogEntry[]
      const jsonl = logs.map((entry) => JSON.stringify(entry)).join('\n')
      writeFileSync(this.logPath, jsonl ? `${jsonl}\n` : '')
    } catch (err) {
      console.error(`[AUDIT] Failed to migrate audit log format: ${err}`)
    }
  }

  private loadLogs(): AuditLogEntry[] {
    try {
      if (!existsSync(this.logPath)) {
        return []
      }
      const raw = readFileSync(this.logPath, 'utf-8')
      return this.parseLogs(raw)
    } catch (err) {
      console.error(`[AUDIT] Failed to load logs: ${err}`)
      return []
    }
  }

  log(event: AuditEvent, details: Record<string, any>, ip?: string, userAgent?: string): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      ip,
      userAgent,
    }

    this.ensureAppendOnlyFormat()

    try {
      appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`)
    } catch (err) {
      console.error(`[AUDIT] Failed to append log: ${err}`)
    }

    console.log(`[AUDIT] ${event}:`, JSON.stringify(details))
  }

  getLogs(
    filters?: {
      event?: AuditEvent
      startDate?: string
      endDate?: string
      limit?: number
    }
  ): AuditLogEntry[] {
    let logs = this.loadLogs()

    if (filters?.event) {
      logs = logs.filter((log) => log.event === filters.event)
    }

    if (filters?.startDate) {
      logs = logs.filter((log) => log.timestamp >= filters.startDate!)
    }

    if (filters?.endDate) {
      logs = logs.filter((log) => log.timestamp <= filters.endDate!)
    }

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    if (filters?.limit) {
      logs = logs.slice(0, filters.limit)
    }

    return logs
  }
}

// Singleton export
export const auditLogger = new AuditLogger()
