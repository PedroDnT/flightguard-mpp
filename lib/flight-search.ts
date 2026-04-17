import { AERODATABOX_BASE_URL, type FlightInfo } from '@/src/types'

const CACHE_DURATION_MS = 4 * 60 * 1000 // 4 minutes

interface CacheEntry {
  data: any
  timestamp: number
}

const cache = new Map<string, CacheEntry>()

async function cachedFetch(url: string, options: RequestInit): Promise<any> {
  const cacheKey = url
  const now = Date.now()
  const cached = cache.get(cacheKey)

  if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
    return cached.data
  }

  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`Flight API error: ${response.status}`)
  }

  const data = await response.json()
  cache.set(cacheKey, { data, timestamp: now })
  return data
}

export interface FlightSearchParams {
  date: string // YYYY-MM-DD
  airline?: string
  route?: string // e.g., "SCL-GRU"
}

export interface FlightSearchResult {
  flightNumber: string
  airline: string
  route: string
  departureTime: string
  arrivalTime: string
  status: string
  aircraft?: string
}

/**
 * Search for flights on a specific date
 * This is a simplified version that queries available flights
 */
export async function searchFlights(
  params: FlightSearchParams,
  rapidApiKey: string
): Promise<FlightSearchResult[]> {
  const { date, airline, route } = params

  // For demo purposes, we'll search for popular routes
  // In production, you'd want a proper flight search API
  const searchRoutes = route
    ? [route]
    : ['SCL-GRU', 'GRU-SCL', 'GRU-EZE', 'EZE-GRU', 'SCL-EZE', 'EZE-SCL']

  const results: FlightSearchResult[] = []

  for (const searchRoute of searchRoutes) {
    const [origin, dest] = searchRoute.split('-')

    try {
      // Query flights for this route on the specified date
      const url = `${AERODATABOX_BASE_URL}/flights/airports/iata/${origin}/${date}T00:00/${date}T23:59`

      const data = await cachedFetch(url, {
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        },
      })

      if (data.departures) {
        for (const flight of data.departures) {
          // Filter by destination if specified
          if (dest && flight.arrival?.airport?.iata !== dest) {
            continue
          }

          // Filter by airline if specified
          if (airline && flight.airline?.iata !== airline) {
            continue
          }

          results.push({
            flightNumber: flight.number ?? 'Unknown',
            airline: flight.airline?.name ?? 'Unknown',
            route: `${origin} → ${dest ?? flight.arrival?.airport?.iata ?? '?'}`,
            departureTime: flight.departure?.scheduledTime?.utc ?? flight.departure?.scheduledTime?.local ?? 'Unknown',
            arrivalTime: flight.arrival?.scheduledTime?.utc ?? flight.arrival?.scheduledTime?.local ?? 'Unknown',
            status: flight.status ?? 'Scheduled',
            aircraft: flight.aircraft?.model ?? undefined,
          })
        }
      }
    } catch (error) {
      console.error(`[FLIGHT_SEARCH] Error searching route ${searchRoute}:`, error)
      // Continue with other routes even if one fails
    }
  }

  // Remove duplicates based on flight number
  const uniqueFlights = Array.from(
    new Map(results.map(f => [f.flightNumber, f])).values()
  )

  return uniqueFlights
}
