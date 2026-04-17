import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/auth'
import { store } from '@/src/store'

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const policies = store.getAll()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    let filteredPolicies = policies
    if (status) {
      filteredPolicies = policies.filter((p) => p.status === status)
    }

    return NextResponse.json({
      policies: filteredPolicies,
      count: filteredPolicies.length,
    })
  } catch (error) {
    console.error('[API] Failed to fetch policies:', error)
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 }
    )
  }
}
