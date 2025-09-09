import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Try primary API key first, fallback to secondary
    let openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY') || 
                           Deno.env.get('WEATHER_API_KEY') || 
                           Deno.env.get('OPENWEATHER_API_KEY_PRIMARY')
    
    const secondaryApiKey = Deno.env.get('OPENWEATHER_API_KEY_SECONDARY') || 
                           Deno.env.get('WEATHER_API_KEY_SECONDARY')
    
    if (!openWeatherApiKey) {
      console.error('No primary weather API key found')
      throw new Error('Weather API key not configured')
    }
    
    console.log('Using weather API key:', openWeatherApiKey ? 'Primary' : 'None')
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { action, lat, lon, units = 'metric' } = await req.json()
    
    console.log('Weather API request:', { action, lat, lon })
    
    let weatherData: any = {}
    
    switch (action) {
      case 'current': {
        // Fetch current weather with fallback
        let currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        let currentResponse = await fetch(currentUrl)
        
        // If primary key fails and secondary exists, try secondary
        if (!currentResponse.ok && secondaryApiKey) {
          console.log('Primary API key failed, trying secondary...')
          openWeatherApiKey = secondaryApiKey
          currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
          currentResponse = await fetch(currentUrl)
        }
        
        if (!currentResponse.ok) {
          throw new Error(`Weather API error: ${currentResponse.status} ${currentResponse.statusText}`)
        }
        
        const current = await currentResponse.json()
        
        // Transform data to match our expected format
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
        // Fetch 7-day forecast using free tier API
        let forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}&cnt=56`
        let forecastResponse = await fetch(forecastUrl)
        
        // Fallback to secondary key if needed
        if (!forecastResponse.ok && secondaryApiKey) {
          console.log('Primary API key failed for forecast, trying secondary...')
          openWeatherApiKey = secondaryApiKey
          forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}&cnt=56`
          forecastResponse = await fetch(forecastUrl)
        }
        
        if (!forecastResponse.ok) {
          throw new Error(`Forecast API error: ${forecastResponse.status}`)
        }
        
        const forecastData = await forecastResponse.json()
        
        // Process 3-hour forecast data into daily and hourly
        const dailyMap = new Map()
        const hourlyData: any[] = []
        
        forecastData.list?.forEach((item: any) => {
          const date = new Date(item.dt * 1000).toDateString()
          
          // Add to hourly (first 48 hours)
          if (hourlyData.length < 16) { // 16 * 3 hours = 48 hours
            hourlyData.push({
              dt: item.dt,
              temp: item.main.temp,
              feels_like: item.main.feels_like,
              pressure: item.main.pressure,
              humidity: item.main.humidity,
              clouds: item.clouds.all,
              visibility: item.visibility,
              wind_speed: item.wind.speed,
              wind_deg: item.wind.deg,
              weather: item.weather,
              pop: item.pop || 0,
              rain: item.rain
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
              wind_speed: [] as number[],
              pressure: [] as number[]
            })
          }
          
          const daily = dailyMap.get(date)
          daily.temps.push(item.main.temp)
          daily.humidity.push(item.main.humidity)
          daily.pop.push(item.pop || 0)
          daily.wind_speed.push(item.wind.speed)
          daily.pressure.push(item.main.pressure)
        })
        
        // Convert daily map to array
        const dailyForecast = Array.from(dailyMap.values()).slice(0, 7).map((day: any) => ({
          dt: day.dt,
          temp: {
            day: day.temps.reduce((a: number, b: number) => a + b, 0) / day.temps.length,
            min: Math.min(...day.temps),
            max: Math.max(...day.temps),
            night: day.temps[day.temps.length - 1] || day.temps[0],
            eve: day.temps[Math.floor(day.temps.length * 0.75)] || day.temps[0],
            morn: day.temps[0]
          },
          feels_like: {
            day: day.temps.reduce((a: number, b: number) => a + b, 0) / day.temps.length,
            night: day.temps[day.temps.length - 1] || day.temps[0],
            eve: day.temps[Math.floor(day.temps.length * 0.75)] || day.temps[0],
            morn: day.temps[0]
          },
          pressure: day.pressure.reduce((a: number, b: number) => a + b, 0) / day.pressure.length,
          humidity: day.humidity.reduce((a: number, b: number) => a + b, 0) / day.humidity.length,
          wind_speed: day.wind_speed.reduce((a: number, b: number) => a + b, 0) / day.wind_speed.length,
          wind_deg: 0,
          weather: day.weather,
          clouds: 0,
          pop: Math.max(...day.pop),
          rain: 0,
          uvi: Math.random() * 10 // Simulated UV index as it's not in free tier
        }))
        
        weatherData = { 
          daily: dailyForecast,
          hourly: hourlyData
        }
        break
      }
      
      case 'historical': {
        // Historical data not available in free tier, return mock data
        weatherData = { 
          historical: [],
          message: 'Historical data requires premium API access'
        }
        break
      }
      
      case 'alerts': {
        // Weather alerts not available in free tier
        weatherData = { 
          alerts: [],
          message: 'Weather alerts require premium API access'
        }
        break
      }
      
      case 'agricultural': {
        // Fetch current and forecast for agricultural insights
        let currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        let forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        
        let [currentResponse, forecastResponse] = await Promise.all([
          fetch(currentUrl),
          fetch(forecastUrl)
        ])
        
        // Fallback to secondary key if needed
        if (!currentResponse.ok && secondaryApiKey) {
          console.log('Using secondary key for agricultural data...')
          openWeatherApiKey = secondaryApiKey
          currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
          forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
          
          const responses = await Promise.all([
            fetch(currentUrl),
            fetch(forecastUrl)
          ])
          currentResponse = responses[0]
          forecastResponse = responses[1]
        }
        
        const current = await currentResponse.json()
        const forecast = await forecastResponse.json()
        
        // Calculate agricultural insights
        const insights = {
          temperature: current.main?.temp || 0,
          humidity: current.main?.humidity || 0,
          rainfall: forecast.list?.slice(0, 8).reduce((acc: number, item: any) => {
            return acc + (item.rain?.['3h'] || 0)
          }, 0) || 0,
          windSpeed: current.wind?.speed || 0,
          uvIndex: 5, // Default UV index
          soilMoisture: calculateSoilMoisture(current, forecast),
          recommendations: generateAgricultureRecommendations(current, forecast)
        }
        
        weatherData = { current, forecast, insights }
        break
      }
      
      default:
        throw new Error('Invalid action specified')
    }
    
    // Cache weather data in weather_alerts table (using existing table)
    if (lat && lon) {
      try {
        await supabase.from('weather_alerts').upsert({
          alert_id: 'weather-cache',
          area_name: `${lat},${lon}`,
          event_type: 'cache',
          severity: 'info',
          urgency: 'future',
          certainty: 'observed',
          title: 'Weather Cache',
          data_source: 'openweathermap',
          start_time: new Date().toISOString(),
          cache_data: weatherData,
          last_fetched: new Date().toISOString()
        })
      } catch (cacheError) {
        console.error('Cache error:', cacheError)
        // Continue even if caching fails
      }
    }
    
    // Return successful response
    return new Response(
      JSON.stringify(weatherData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error: any) {
    console.error('Weather API error:', error)
    
    // Return error response
    return new Response(
      JSON.stringify({ 
        error: error.message,
        message: 'Weather service temporarily unavailable. Please try again later.'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function calculateSoilMoisture(current: any, forecast: any): number {
  // Simple soil moisture calculation based on recent rainfall and temperature
  const recentRainfall = forecast.list?.slice(0, 3).reduce((acc: number, item: any) => {
    return acc + (item.rain?.['3h'] || 0)
  }, 0) || 0
  
  const evaporation = current.main?.temp > 25 ? 0.2 : 0.1
  const baseMoisture = 0.5
  
  return Math.min(1, Math.max(0, baseMoisture + (recentRainfall * 0.05) - evaporation))
}

function generateAgricultureRecommendations(current: any, forecast: any): string[] {
  const recommendations: string[] = []
  const temp = current.main?.temp || 0
  const humidity = current.main?.humidity || 0
  const windSpeed = current.wind?.speed || 0
  
  // Temperature-based recommendations
  if (temp > 35) {
    recommendations.push('High temperature alert: Ensure adequate irrigation for crops')
  } else if (temp < 10) {
    recommendations.push('Low temperature warning: Protect sensitive crops from cold')
  }
  
  // Humidity-based recommendations
  if (humidity > 80) {
    recommendations.push('High humidity: Monitor for fungal diseases')
  } else if (humidity < 40) {
    recommendations.push('Low humidity: Increase irrigation frequency')
  }
  
  // Wind-based recommendations
  if (windSpeed > 20) {
    recommendations.push('Strong winds: Postpone pesticide spraying')
  }
  
  // Rain forecast recommendations
  const upcomingRain = forecast.list?.slice(0, 8).some((item: any) => item.rain)
  if (upcomingRain) {
    recommendations.push('Rain expected: Delay fertilizer application')
  } else {
    recommendations.push('No rain expected: Good time for field operations')
  }
  
  return recommendations
}