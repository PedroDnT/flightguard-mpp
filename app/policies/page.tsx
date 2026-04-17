'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Policy {
  id: string
  flightNumber: string
  date: string
  status: string
  payoutAmount: string
  payoutAddress: string
  scheduledDeparture: string
  lastFlightStatus?: string
  payoutTxHash?: string
}

export default function PoliciesPage() {
  const [address, setAddress] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lookupPolicy = async () => {
    if (!policyId.trim()) {
      setError('Please enter a policy ID')
      return
    }

    setLoading(true)
    setError('')
    setPolicy(null)

    try {
      const response = await fetch(`/api/policy/${encodeURIComponent(policyId.trim())}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Policy not found')
      }

      setPolicy(data.policy)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-blue-100 text-blue-800',
      paid_out: 'bg-green-100 text-green-800',
      expired: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-3">
              <span className="text-3xl">✈️</span>
              <h1 className="text-2xl font-bold text-accent">FlightGuard</h1>
            </Link>
            <nav className="flex space-x-6">
              <Link href="/" className="text-gray-700 hover:text-accent font-medium">
                Home
              </Link>
              <Link href="/flights" className="text-gray-700 hover:text-accent font-medium">
                Search Flights
              </Link>
              <Link href="/admin" className="text-gray-700 hover:text-accent font-medium">
                Admin
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">My Policies</h2>

        {/* Policy Lookup */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Check Policy Status</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Enter Policy ID"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupPolicy()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <button
              onClick={lookupPolicy}
              disabled={loading}
              className="px-8 py-2 bg-accent hover:bg-accent-dark text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Check Status'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Policy Details */}
        {policy && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Policy Details</h3>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusBadge(
                  policy.status
                )}`}
              >
                {policy.status.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-600">Policy ID</span>
                  <p className="font-mono text-sm font-semibold mt-1 break-all">{policy.id}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Flight Number</span>
                  <p className="font-semibold text-lg mt-1">{policy.flightNumber}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Date</span>
                  <p className="font-semibold mt-1">{policy.date}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Scheduled Departure</span>
                  <p className="font-semibold mt-1">
                    {new Date(policy.scheduledDeparture).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Premium Paid</span>
                    <p className="font-bold text-lg mt-1">{policy.premium} pathUSD</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Payout Amount</span>
                    <p className="font-bold text-lg text-green-600 mt-1">
                      {policy.payoutAmount} pathUSD
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <span className="text-sm text-gray-600">Payout Address</span>
                <p className="font-mono text-sm mt-1 break-all">{policy.payoutAddress}</p>
              </div>

              {policy.lastFlightStatus && (
                <div className="border-t border-gray-200 pt-4">
                  <span className="text-sm text-gray-600">Last Flight Status</span>
                  <p className="font-semibold mt-1">{policy.lastFlightStatus}</p>
                </div>
              )}

              {policy.payoutTxHash && (
                <div className="border-t border-gray-200 pt-4">
                  <span className="text-sm text-gray-600">Payout Transaction</span>
                  <a
                    href={`https://explore.testnet.tempo.xyz/tx/${policy.payoutTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-accent hover:text-accent-dark mt-1 block break-all"
                  >
                    {policy.payoutTxHash}
                  </a>
                </div>
              )}
            </div>

            {policy.status === 'active' && (
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  ⏱️ Your flight is being monitored every 5 minutes. If it's delayed by 60+ minutes,
                  you'll automatically receive the payout.
                </p>
              </div>
            )}

            {policy.status === 'paid_out' && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-900">
                  ✅ Payout sent! Check your wallet for the {policy.payoutAmount} pathUSD.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
