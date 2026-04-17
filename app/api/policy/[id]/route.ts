import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/src/store'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    console.log(`[API] GET /api/policy/${id}`)

    const policy = store.get(id)
    if (!policy) {
      return NextResponse.json(
        { error: `Policy not found: ${id}` },
        { status: 404 }
      )
    }

    return NextResponse.json({ policy })
  } catch (error) {
    console.error('[API] Policy lookup failed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch policy' },
      { status: 500 }
    )
  }
}
