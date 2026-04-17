const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!ADMIN_PASSWORD) {
  console.warn('[AUTH] ADMIN_PASSWORD not set in environment variables')
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!ADMIN_PASSWORD) {
    return false
  }

  // Simple comparison (not hashed for simplicity as per requirements)
  return password === ADMIN_PASSWORD
}

export function isAdminAuthenticated(request: Request): boolean {
  // Check for admin session cookie
  const cookies = request.headers.get('cookie') ?? ''
  return cookies.includes('admin_session=true')
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwarded?.split(',')[0] ?? realIp ?? 'unknown'
}
