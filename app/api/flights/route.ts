import { NextRequest, NextResponse } from 'next/server'
import { searchFlights } from '@/lib/flight-search'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date')
    const airline = searchParams.get('airline') ?? undefined
    const route = searchParams.get('route') ?? undefined

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY
    if (!rapidApiKey) {
      return NextResponse.json(
        { error: 'Flight search not configured' },
        { status: 503 }
      )
    }

    console.log(`[API] Searching flights for date: ${date}`)

    const flights = await searchFlights(
      { date, airline, route },
      rapidApiKey
    )

    return NextResponse.json({
      date,
      count: flights.length,
      flights,
    })
  } catch (error) {
    console.error('[API] Flight search failed:', error)
    return NextResponse.json(
      { error: 'Flight search failed' },
      { status: 500 }
    )
  }
}
