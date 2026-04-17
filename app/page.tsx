import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">✈️</span>
              <h1 className="text-2xl font-bold text-accent">FlightGuard</h1>
            </div>
            <nav className="flex space-x-6">
              <Link href="/" className="text-gray-700 hover:text-accent font-medium">
                Buy Insurance
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

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl mb-4">
            Parametric Flight Delay Insurance
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get automatically compensated if your flight is delayed. No claims, no paperwork.
            Payouts happen automatically on-chain.
          </p>
        </div>

        {/* How it Works */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl p-6 shadow-md text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">1. Search Flights</h3>
            <p className="text-gray-600">
              Find your flight by date and purchase insurance
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md text-center">
            <div className="text-4xl mb-4">💳</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">2. Pay Premium</h3>
            <p className="text-gray-600">
              1 pathUSD premium via MPP micropayment
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-md text-center">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">3. Get Paid Out</h3>
            <p className="text-gray-600">
              Receive 5 pathUSD automatically if delayed 60+ minutes
            </p>
          </div>
        </div>

        {/* Flight Search CTA */}
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Search for Flights
          </h3>
          <Link
            href="/flights"
            className="block w-full bg-accent hover:bg-accent-dark text-white font-bold py-4 px-6 rounded-lg text-center text-lg transition-colors"
          >
            Find Your Flight →
          </Link>
          <p className="text-center text-gray-600 mt-4 text-sm">
            Search by date to see available flights for insurance
          </p>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-3xl mx-auto text-center">
          <div>
            <div className="text-3xl font-bold text-accent">$1</div>
            <div className="text-gray-600 mt-1">Premium</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-accent">$5</div>
            <div className="text-gray-600 mt-1">Payout</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-accent">60min</div>
            <div className="text-gray-600 mt-1">Delay Threshold</div>
          </div>
        </div>
      </div>
    </main>
  )
}
