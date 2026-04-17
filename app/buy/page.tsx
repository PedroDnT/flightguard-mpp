'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function BuyPageContent() {
  const searchParams = useSearchParams()
  const [flightNumber, setFlightNumber] = useState('')
  const [date, setDate] = useState('')
  const [payoutAddress, setPayoutAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [policyId, setPolicyId] = useState('')
  const [needsPayment, setNeedsPayment] = useState(false)
  const [paymentChallenge, setPaymentChallenge] = useState('')

  useEffect(() => {
    const flight = searchParams.get('flight')
    const flightDate = searchParams.get('date')
    if (flight) setFlightNumber(flight)
    if (flightDate) setDate(flightDate)
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/insure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightNumber,
          date,
          payoutAddress,
        }),
      })

      if (response.status === 402) {
        // Payment required
        const wwwAuth = response.headers.get('WWW-Authenticate')
        setPaymentChallenge(wwwAuth || '')
        setNeedsPayment(true)
        setError('Payment required. Please use mppx CLI to complete payment.')
        setLoading(false)
        return
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create policy')
      }

      setPolicyId(data.policyId)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success && policyId) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <Link href="/" className="flex items-center space-x-3">
                <span className="text-3xl">✈️</span>
                <h1 className="text-2xl font-bold text-accent">FlightGuard</h1>
              </Link>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-3xl font-bold text-green-600 mb-2">
                Policy Active!
              </h2>
              <p className="text-gray-600">
                Your flight delay insurance has been created successfully.
              </p>
            </div>

            <div className="border-t border-b border-gray-200 py-4 space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Policy ID:</span>
                <span className="font-mono text-sm font-semibold">{policyId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Flight:</span>
                <span className="font-semibold">{flightNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-semibold">{date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Premium Paid:</span>
                <span className="font-semibold">1.00 pathUSD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payout Amount:</span>
                <span className="font-semibold text-green-600">5.00 pathUSD</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">
                💡 Your flight will be monitored automatically. If it's delayed by 60+ minutes,
                you'll receive 5 pathUSD automatically at your payout address.
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/policies"
                className="block w-full text-center bg-accent hover:bg-accent-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Find Policy by ID
              </Link>
              <p className="text-center text-sm text-gray-600">
                Use the policy ID above in the lookup form on the policies page.
              </p>
              <Link
                href="/flights"
                className="block w-full text-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Buy Another Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
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
              <Link href="/policies" className="text-gray-700 hover:text-accent font-medium">
                My Policies
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Buy Flight Delay Insurance
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="flightNumber" className="block text-sm font-semibold text-gray-700 mb-2">
                Flight Number
              </label>
              <input
                type="text"
                id="flightNumber"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                placeholder="e.g., LA3251"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="date" className="block text-sm font-semibold text-gray-700 mb-2">
                Departure Date
              </label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="payoutAddress" className="block text-sm font-semibold text-gray-700 mb-2">
                Payout Wallet Address
              </label>
              <input
                type="text"
                id="payoutAddress"
                value={payoutAddress}
                onChange={(e) => setPayoutAddress(e.target.value)}
                placeholder="0x..."
                required
                pattern="0x[0-9a-fA-F]{40}"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent font-mono text-sm"
              />
              <p className="mt-2 text-sm text-gray-600">
                This address will receive the 5 pathUSD payout if your flight is delayed.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Premium:</span>
                <span className="font-bold">1.00 pathUSD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payout (if delayed 60+ min):</span>
                <span className="font-bold text-green-600">5.00 pathUSD</span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-700 font-semibold">5x Return</span>
                  <span className="text-gray-700 font-semibold">500% ROI</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
                {needsPayment && (
                  <div className="mt-3">
                    <p className="text-xs text-red-700 font-mono bg-red-100 p-2 rounded">
                      Use mppx CLI to complete payment
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-4 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
            >
              {loading ? 'Processing...' : 'Buy Insurance with MPP'}
            </button>

            <p className="text-xs text-gray-500 text-center">
              Payment via Machine Payments Protocol (MPP). You'll need 1 pathUSD in your wallet.
            </p>
          </form>
        </div>
      </div>
    </main>
  )
}

export default function BuyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BuyPageContent />
    </Suspense>
  )
}
