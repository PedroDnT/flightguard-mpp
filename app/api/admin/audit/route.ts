import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/auth'
import { auditLogger } from '@/lib/audit'

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const event = searchParams.get('event') ?? undefined
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100

    const logs = auditLogger.getLogs({
      event: event as any,
      startDate,
      endDate,
      limit,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('[API] Failed to fetch audit logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}
