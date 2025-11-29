/**
 * Geolocation Utility
 * Handles location detection with multiple fallback strategies
 */

interface GeoLocation {
  latitude: number
  longitude: number
}

interface LocationProvider {
  name: string
  url: string
  parse: (data: any) => { latitude: number; longitude: number } | null
}

/**
 * IP Geolocation providers (in order of preference)
 */
const IP_PROVIDERS: LocationProvider[] = [
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (data) => {
      if (!data.latitude || !data.longitude) return null
      return {
        latitude: data.latitude,
        longitude: data.longitude,
      }
    },
  },
  {
    name: 'ip-api.com',
    url: 'http://ip-api.com/json/',
    parse: (data) => {
      if (!data.lat || !data.lon) return null
      return {
        latitude: data.lat,
        longitude: data.lon,
      }
    },
  },
  {
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    parse: (data) => {
      if (!data.loc) return null
      const [lat, lon] = data.loc.split(',')
      return {
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
      }
    },
  },
]

/**
 * Get location from IP address using multiple providers
 */
async function getLocationFromIP(): Promise<GeoLocation> {
  for (const provider of IP_PROVIDERS) {
    try {
      const response = await fetch(provider.url, {
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) continue

      const data = await response.json()
      const location = provider.parse(data)

      if (location && location.latitude && location.longitude) {
        return location
      }
    } catch {
      // Try next provider
      continue
    }
  }

  throw new Error('所有IP定位服务均不可用')
}

/**
 * Get location from browser Geolocation API
 */
function getLocationFromBrowser(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持地理位置功能'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        reject(error)
      },
      {
        timeout: 5000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    )
  })
}

/**
 * Get user's current location
 * Tries browser Geolocation API first, falls back to IP-based location
 */
export async function getCurrentLocation(): Promise<GeoLocation> {
  try {
    // Try browser Geolocation API first
    return await getLocationFromBrowser()
  } catch {
    // Fallback to IP-based location
    return await getLocationFromIP()
  }
}
