import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Type definitions
interface WeatherRequest {
  action: 'current' | 'forecast' | 'agricultural'
  lat: number
  lon: number
  units?: 'metric' | 'imperial' | 'standard'
}

interface CurrentWeatherData {
  temp: number
  feels_like: number
  temp_min: number
  temp_max: number
  humidity: number
  pressure: number
  wind_speed: number
  wind_deg: number
  description: string
  main: string
  icon: string
  clouds: number
  visibility: number
  sunrise: number
  sunset: number
  location: string
  dt: number
}

interface ForecastItem {
  dt: number
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number
  weather: Array<{ description: string; main: string; icon: string }>
  pop: number
}

interface DailyForecast {
  dt: number
  temp: { day: number; min: number; max: number }
  humidity: number
  wind_speed: number
  weather: Array<{ description: string; main: string; icon: string }>
  pop: number
}

interface AgricultureInsights {
  temperature: number
  humidity: number
  windSpeed: number
  recommendations: string[]
}

// Helper functions (modularized)
async function fetchCurrentWeather(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<CurrentWeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  return {
    temp: data.main?.temp ?? 0,
    feels_like: data.main?.feels_like ?? 0,
    temp_min: data.main?.temp_min ?? 0,
    temp_max: data.main?.temp_max ?? 0,
    humidity: data.main?.humidity ?? 0,
    pressure: data.main?.pressure ?? 0,
    wind_speed: data.wind?.speed ?? 0,
    wind_deg: data.wind?.deg ?? 0,
    description: data.weather?.[0]?.description ?? 'Unknown',
    main: data.weather?.[0]?.main ?? 'Unknown',
    icon: data.weather?.[0]?.icon ?? '01d',
    clouds: data.clouds?.all ?? 0,
    visibility: data.visibility ?? 10000,
    sunrise: data.sys?.sunrise ?? 0,
    sunset: data.sys?.sunset ?? 0,
    location: data.name ?? 'Unknown',
    dt: data.dt ?? Date.now() / 1000
  }
}

async function fetchForecastData(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<{ daily: DailyForecast[]; hourly: ForecastItem[] }> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}&cnt=56`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Process hourly data (first 48 hours)
  const hourlyData: ForecastItem[] = data.list.slice(0, 16).map((item: any) => ({
    dt: item.dt,
    temp: item.main.temp,
    feels_like: item.main.feels_like,
    humidity: item.main.humidity,
    wind_speed: item.wind.speed,
    weather: item.weather,
    pop: item.pop ?? 0
  }))
  
  // Process daily data
  const dailyMap = new Map<string, any>()
  
  data.list?.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toDateString()
    
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        dt: item.dt,
        temps: [] as number[],
        humidity: [] as number[],
        weather: item.weather,
        pop: [] as number[],
        wind_speed: [] as number[]
      })
    }
    
    const daily = dailyMap.get(date)!
    daily.temps.push(item.main.temp)
    daily.humidity.push(item.main.humidity)
    daily.pop.push(item.pop ?? 0)
    daily.wind_speed.push(item.wind.speed)
  })
  
  const dailyForecast: DailyForecast[] = Array.from(dailyMap.values())
    .slice(0, 7)
    .map(day => ({
      dt: day.dt,
      temp: {
        day: day.temps.reduce((a: number, b: number) => a + b, 0) / day.temps.length,
        min: Math.min(...day.temps),
        max: Math.max(...day.temps)
      },
      humidity: day.humidity.reduce((a: number, b: number) => a + b, 0) / day.humidity.length,
      wind_speed: day.wind_speed.reduce((a: number, b: number) => a + b, 0) / day.wind_speed.length,
      weather: day.weather,
      pop: Math.max(...day.pop)
    }))
  
  return { daily: dailyForecast, hourly: hourlyData }
}

function generateAgricultureInsights(
  current: CurrentWeatherData,
  forecast: { daily: DailyForecast[]; hourly: ForecastItem[] }
): AgricultureInsights {
  const recommendations: string[] = []
  const { temp, humidity, wind_speed: windSpeed } = current
  
  // Temperature recommendations
  if (temp > 35) {
    recommendations.push('High temperature: Ensure adequate irrigation')
  } else if (temp < 10) {
    recommendations.push('Low temperature: Protect sensitive crops')
  }
  
  // Humidity recommendations  
  if (humidity > 80) {
    recommendations.push('High humidity: Monitor for fungal diseases')
  } else if (humidity < 40) {
    recommendations.push('Low humidity: Increase irrigation frequency')
  }
  
  // Wind recommendations
  if (windSpeed > 20) {
    recommendations.push('Strong winds: Postpone pesticide spraying')
  }
  
  // Rain forecast check
  const hasUpcomingRain = forecast.hourly.slice(0, 8).some(h => h.pop > 0.3)
  if (hasUpcomingRain) {
    recommendations.push('Rain expected: Delay fertilizer application')
  }
  
  return {
    temperature: temp,
    humidity,
    windSpeed,
    recommendations
  }
}

async function cacheWeatherData(
  supabase: any,
  lat: number,
  lon: number,
  action: string,
  data: unknown
): Promise<void> {
  try {
    await supabase.from('weather_cache').upsert({
      id: `${lat}-${lon}-${action}`,
      lat,
      lon,
      data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cache error (non-critical):', error)
  }
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY') || 
                             Deno.env.get('WEATHER_API_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    if (!openWeatherApiKey) {
      throw new Error('Weather API key not configured')
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse and validate request
    const body = await req.json() as WeatherRequest
    const { action, lat, lon, units = 'metric' } = body
    
    if (!lat || !lon) {
      throw new Error('Latitude and longitude are required')
    }
    
    console.log('Processing weather request:', { action, lat, lon })
    
    // Process based on action
    let responseData: unknown = {}
    
    switch (action) {
      case 'current': {
        responseData = await fetchCurrentWeather(lat, lon, openWeatherApiKey, units)
        break
      }
      
      case 'forecast': {
        responseData = await fetchForecastData(lat, lon, openWeatherApiKey, units)
        break
      }
      
      case 'agricultural': {
        const [current, forecast] = await Promise.all([
          fetchCurrentWeather(lat, lon, openWeatherApiKey, units),
          fetchForecastData(lat, lon, openWeatherApiKey, units)
        ])
        
        const insights = generateAgricultureInsights(current, forecast)
        responseData = { current, forecast, insights }
        break
      }
      
      default:
        throw new Error(`Invalid action: ${action}. Use: current, forecast, or agricultural`)
    }
    
    // Cache the data
    await cacheWeatherData(supabase, lat, lon, action, responseData)
    
    // Return success response
    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('Weather function error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        message: 'Weather service temporarily unavailable'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})