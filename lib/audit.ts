import { writeFileSync, readFileSync, existsSync } from 'fs'
import { writeFileSync, readFileSync, existsSync } from 'fs'

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

  constructor(logPath: string = AUDIT_LOG_PATH) {
    this.logPath = logPath
  }

  private loadLogs(): AuditLogEntry[] {
    try {
      if (!existsSync(this.logPath)) {
        return []
      }
      const raw = readFileSync(this.logPath, 'utf-8')
      return JSON.parse(raw) as AuditLogEntry[]
    } catch (err) {
      console.error(`[AUDIT] Failed to load logs: ${err}`)
      return []
    }
  }

  private saveLogs(logs: AuditLogEntry[]): void {
    try {
      writeFileSync(this.logPath, JSON.stringify(logs, null, 2))
    } catch (err) {
      console.error(`[AUDIT] Failed to save logs: ${err}`)
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

    const logs = this.loadLogs()
    logs.push(entry)
    this.saveLogs(logs)

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
