'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Flight {
  flightNumber: string
  airline: string
  route: string
  departureTime: string
  arrivalTime: string
  status: string
  aircraft?: string
}

export default function FlightsPage() {
  const [date, setDate] = useState('')
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const searchFlights = async () => {
    if (!date) {
      setError('Please select a date')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/flights?date=${date}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search flights')
      }

      setFlights(data.flights || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0]
  }

  const getMaxDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().split('T')[0]
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
              <Link href="/policies" className="text-gray-700 hover:text-accent font-medium">
                My Policies
              </Link>
              <Link href="/admin" className="text-gray-700 hover:text-accent font-medium">
                Admin
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search Form */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Search for Flights</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                Departure Date
              </label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={getTodayDate()}
                max={getMaxDate()}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={searchFlights}
                disabled={loading || !date}
                className="w-full sm:w-auto px-8 py-2 bg-accent hover:bg-accent-dark text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Searching...' : 'Search Flights'}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {flights.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Available Flights ({flights.length})
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {flights.map((flight) => (
                <div
                  key={flight.flightNumber}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">
                        {flight.flightNumber}
                      </h4>
                      <p className="text-sm text-gray-600">{flight.airline}</p>
                    </div>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                      {flight.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="font-medium mr-2">Route:</span>
                      <span>{flight.route}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                      <span className="font-medium mr-2">Departure:</span>
                      <span>{new Date(flight.departureTime).toLocaleString()}</span>
                    </div>
                    {flight.aircraft && (
                      <div className="flex items-center text-sm text-gray-700">
                        <span className="font-medium mr-2">Aircraft:</span>
                        <span>{flight.aircraft}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-gray-600">Premium:</span>
                      <span className="font-bold text-gray-900">1.00 pathUSD</span>
                    </div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-gray-600">Payout (60min+ delay):</span>
                      <span className="font-bold text-green-600">5.00 pathUSD</span>
                    </div>
                    <Link
                      href={`/buy?flight=${flight.flightNumber}&date=${date}`}
                      className="block w-full text-center bg-accent hover:bg-accent-dark text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Buy Insurance
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && flights.length === 0 && date && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">
              No flights found for the selected date. Try a different date.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
