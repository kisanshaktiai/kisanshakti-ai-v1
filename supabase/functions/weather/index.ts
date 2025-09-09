import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WeatherRequest {
  action: string
  lat: number
  lon: number
  units?: string
}

interface WeatherResponse {
  [key: string]: unknown
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    // Get weather API key
    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY') || 
                             Deno.env.get('WEATHER_API_KEY') || 
                             Deno.env.get('OPENWEATHER_API_KEY_PRIMARY')
    
    if (!openWeatherApiKey) {
      console.error('No weather API key found in environment')
      throw new Error('Weather API key not configured')
    }
    
    console.log('Weather function initialized successfully')
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const body = await req.json() as WeatherRequest
    const { action, lat, lon, units = 'metric' } = body
    
    console.log('Weather API request:', { action, lat, lon })
    
    let weatherData: WeatherResponse = {}
    
    switch (action) {
      case 'current': {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const currentResponse = await fetch(currentUrl)
        
        if (!currentResponse.ok) {
          throw new Error(`Weather API error: ${currentResponse.status}`)
        }
        
        const current = await currentResponse.json()
        
        weatherData = {
          temp: current.main?.temp || 0,
          feels_like: current.main?.feels_like || 0,
          temp_min: current.main?.temp_min || 0,
          temp_max: current.main?.temp_max || 0,
          humidity: current.main?.humidity || 0,
          pressure: current.main?.pressure || 0,
          wind_speed: current.wind?.speed || 0,
          wind_deg: current.wind?.deg || 0,
          description: current.weather?.[0]?.description || 'Unknown',
          main: current.weather?.[0]?.main || 'Unknown',
          icon: current.weather?.[0]?.icon || '01d',
          clouds: current.clouds?.all || 0,
          visibility: current.visibility || 10000,
          sunrise: current.sys?.sunrise || 0,
          sunset: current.sys?.sunset || 0,
          location: current.name || 'Unknown',
          dt: current.dt || Date.now() / 1000
        }
        break
      }
      
      case 'forecast': {
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}&cnt=56`
        const forecastResponse = await fetch(forecastUrl)
        
        if (!forecastResponse.ok) {
          throw new Error(`Forecast API error: ${forecastResponse.status}`)
        }
        
        const forecastData = await forecastResponse.json()
        
        // Process forecast data
        const processedData = processForecastData(forecastData)
        
        weatherData = { 
          daily: processedData.daily,
          hourly: processedData.hourly
        }
        break
      }
      
      case 'agricultural': {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        
        const [currentResponse, forecastResponse] = await Promise.all([
          fetch(currentUrl),
          fetch(forecastUrl)
        ])
        
        if (!currentResponse.ok || !forecastResponse.ok) {
          throw new Error('Failed to fetch weather data')
        }
        
        const current = await currentResponse.json()
        const forecast = await forecastResponse.json()
        
        const insights = generateAgricultureInsights(current, forecast)
        
        weatherData = { current, forecast, insights }
        break
      }
      
      default:
        weatherData = { 
          message: 'Invalid action specified. Use: current, forecast, or agricultural'
        }
    }
    
    // Cache weather data
    try {
      await supabase.from('weather_cache').upsert({
        id: `${lat}-${lon}-${action}`,
        lat,
        lon,
        data: weatherData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    } catch (cacheError) {
      console.error('Cache error (non-critical):', cacheError)
    }
    
    return new Response(
      JSON.stringify(weatherData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

function processForecastData(forecastData: any) {
  const dailyMap = new Map()
  const hourlyData: any[] = []
  
  forecastData.list?.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toDateString()
    
    // Add to hourly (first 48 hours)
    if (hourlyData.length < 16) {
      hourlyData.push({
        dt: item.dt,
        temp: item.main.temp,
        feels_like: item.main.feels_like,
        humidity: item.main.humidity,
        wind_speed: item.wind.speed,
        weather: item.weather,
        pop: item.pop || 0
      })
    }
    
    // Aggregate for daily
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
    
    const daily = dailyMap.get(date)
    daily.temps.push(item.main.temp)
    daily.humidity.push(item.main.humidity)
    daily.pop.push(item.pop || 0)
    daily.wind_speed.push(item.wind.speed)
  })
  
  // Convert daily map to array
  const dailyForecast = Array.from(dailyMap.values()).slice(0, 7).map((day: any) => ({
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

function generateAgricultureInsights(current: any, forecast: any) {
  const temp = current.main?.temp || 0
  const humidity = current.main?.humidity || 0
  const windSpeed = current.wind?.speed || 0
  
  const recommendations: string[] = []
  
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
  
  // Rain forecast
  const upcomingRain = forecast.list?.slice(0, 8).some((item: any) => item.rain)
  if (upcomingRain) {
    recommendations.push('Rain expected: Delay fertilizer application')
  }
  
  return {
    temperature: temp,
    humidity: humidity,
    windSpeed: windSpeed,
    recommendations: recommendations
  }
}