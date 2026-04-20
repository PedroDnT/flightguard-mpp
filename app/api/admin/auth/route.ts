import { NextRequest, NextResponse } from 'next/server'
import { auditLogger } from '@/lib/audit'
import { verifyAdminPassword, getClientIp } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    if (!password) {
      return NextResponse.json(
        { error: 'Password required' },
        { status: 400 }
      )
    }

    const isValid = await verifyAdminPassword(password)

    if (!isValid) {
      const ip = getClientIp(request)
      auditLogger.log('admin_login', { success: false }, ip)
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    const ip = getClientIp(request)
    auditLogger.log('admin_login', { success: true }, ip)

    // Set session cookie
    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_session', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
    })

    return response
  } catch (error) {
    console.error('[API] Admin auth error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
