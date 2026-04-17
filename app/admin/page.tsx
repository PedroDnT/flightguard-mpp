'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [poolData, setPoolData] = useState<any>(null)
  const [policies, setPolicies] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      setIsAuthenticated(true)
      loadDashboardData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDashboardData = async () => {
    try {
      // Load pool health
      const healthRes = await fetch('/api/health')
      const healthData = await healthRes.json()
      setPoolData(healthData)

      // Load policies
      const policiesRes = await fetch('/api/admin/policies')
      const policiesData = await policiesRes.json()
      setPolicies(policiesData.policies || [])

      // Load recent audit logs
      const auditRes = await fetch('/api/admin/audit?limit=10')
      const auditData = await auditRes.json()
      setAuditLogs(auditData.logs || [])
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }
  }

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/policies')
        if (response.ok) {
          setIsAuthenticated(true)
          loadDashboardData()
        }
      } catch (error) {
        // Not authenticated
      }
    }
    checkAuth()
  }, [])

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="text-4xl mb-4">🔐</div>
              <h2 className="text-3xl font-bold text-gray-900">Admin Login</h2>
              <p className="text-gray-600 mt-2">Enter password to access admin panel</p>
            </div>

            <form onSubmit={login} className="space-y-6">
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="Enter admin password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/" className="text-accent hover:text-accent-dark text-sm font-medium">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🛡️</span>
              <h1 className="text-2xl font-bold text-accent">Admin Panel</h1>
            </div>
            <Link href="/" className="text-gray-700 hover:text-accent font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Pool Status */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Pool Status</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Pool Balance</div>
              <div className="text-3xl font-bold text-accent">
                {poolData?.pool?.balance || '—'}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Pool Address</div>
              <div className="text-sm font-mono break-all">
                {poolData?.pool?.address || '—'}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Network</div>
              <div className="text-lg font-semibold">
                {poolData?.network?.chainId === 42431 ? 'Tempo Testnet' : 'Tempo Mainnet'}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Policy Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-blue-600">
                {poolData?.policies?.active || 0}
              </div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-green-600">
                {poolData?.policies?.paid_out || 0}
              </div>
              <div className="text-sm text-gray-600">Paid Out</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-gray-600">
                {poolData?.policies?.expired || 0}
              </div>
              <div className="text-sm text-gray-600">Expired</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-red-600">
                {poolData?.policies?.cancelled || 0}
              </div>
              <div className="text-sm text-gray-600">Cancelled</div>
            </div>
          </div>
        </div>

        {/* Recent Policies */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Policies</h2>
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Policy ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Flight
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Payout
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {policies.slice(0, 10).map((policy) => (
                    <tr key={policy.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {policy.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                        {policy.flightNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{policy.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {policy.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                        {policy.payoutAmount} pathUSD
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Audit Logs */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Activity</h2>
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="space-y-3">
              {auditLogs.map((log, index) => (
                <div key={index} className="flex justify-between items-start border-b pb-3 last:border-0">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{log.event.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">{log.ip}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
