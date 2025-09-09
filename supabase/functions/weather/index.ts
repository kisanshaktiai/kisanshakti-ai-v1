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
    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { action, lat, lon, city, units = 'metric' } = await req.json()
    
    console.log('Weather API request:', { action, lat, lon, city })
    
    let weatherData = {}
    
    switch (action) {
      case 'current': {
        // Fetch current weather
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const currentResponse = await fetch(currentUrl)
        const current = await currentResponse.json()
        
        // Fetch air quality data
        const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}`
        const airResponse = await fetch(airUrl)
        const airQuality = await airResponse.json()
        
        weatherData = { current, airQuality }
        break
      }
      
      case 'forecast': {
        // Fetch 5-day forecast (3-hour intervals)
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const forecastResponse = await fetch(forecastUrl)
        const forecast = await forecastResponse.json()
        
        // Fetch hourly forecast for 48 hours
        const hourlyUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely&appid=${openWeatherApiKey}&units=${units}`
        const hourlyResponse = await fetch(hourlyUrl)
        const hourlyData = await hourlyResponse.json()
        
        weatherData = { forecast, hourly: hourlyData }
        break
      }
      
      case 'historical': {
        // Get historical data for comparison (last 5 days)
        const historicalData = []
        const currentTime = Math.floor(Date.now() / 1000)
        
        for (let i = 1; i <= 5; i++) {
          const timestamp = currentTime - (i * 86400) // Days ago
          const histUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${timestamp}&appid=${openWeatherApiKey}&units=${units}`
          const histResponse = await fetch(histUrl)
          const histData = await histResponse.json()
          historicalData.push(histData)
        }
        
        weatherData = { historical: historicalData }
        break
      }
      
      case 'alerts': {
        // Fetch weather alerts for the region
        const alertsUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,daily&appid=${openWeatherApiKey}`
        const alertsResponse = await fetch(alertsUrl)
        const alertsData = await alertsResponse.json()
        
        weatherData = { alerts: alertsData.alerts || [] }
        break
      }
      
      case 'agricultural': {
        // Fetch all weather data for agricultural insights
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        const soilUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=${units}`
        
        const [currentResponse, forecastResponse] = await Promise.all([
          fetch(currentUrl),
          fetch(forecastUrl)
        ])
        
        const current = await currentResponse.json()
        const forecast = await forecastResponse.json()
        
        // Calculate agricultural insights
        const insights = {
          temperature: current.main.temp,
          humidity: current.main.humidity,
          rainfall: forecast.list.slice(0, 8).reduce((acc: number, item: any) => {
            return acc + (item.rain?.['3h'] || 0)
          }, 0),
          windSpeed: current.wind.speed,
          uvIndex: current.uvi || 5, // Default UV index if not available
          soilMoisture: calculateSoilMoisture(current, forecast),
          recommendations: generateAgricultureRecommendations(current, forecast)
        }
        
        weatherData = { current, forecast, insights }
        break
      }
      
      default:
        throw new Error('Invalid action specified')
    }
    
    // Cache weather data in database for offline access
    if (lat && lon) {
      await supabase.from('weather_cache').upsert({
        location: `${lat},${lon}`,
        data: weatherData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'location'
      })
    }
    
    return new Response(
      JSON.stringify({ success: true, data: weatherData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Weather API error:', error)
    
    // Try to return cached data if available
    if (req.method === 'POST') {
      const { lat, lon } = await req.json()
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      const { data: cachedData } = await supabase
        .from('weather_cache')
        .select('data')
        .eq('location', `${lat},${lon}`)
        .single()
      
      if (cachedData) {
        return new Response(
          JSON.stringify({ success: true, data: cachedData.data, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function calculateSoilMoisture(current: any, forecast: any): number {
  // Simple soil moisture calculation based on recent rainfall and temperature
  const recentRainfall = forecast.list.slice(0, 3).reduce((acc: number, item: any) => {
    return acc + (item.rain?.['3h'] || 0)
  }, 0)
  
  const evaporation = current.main.temp > 25 ? 0.2 : 0.1
  const baseMoisture = 0.5
  
  return Math.min(1, Math.max(0, baseMoisture + (recentRainfall * 0.05) - evaporation))
}

function generateAgricultureRecommendations(current: any, forecast: any): string[] {
  const recommendations = []
  const temp = current.main.temp
  const humidity = current.main.humidity
  const windSpeed = current.wind.speed
  
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
  const upcomingRain = forecast.list.slice(0, 8).some((item: any) => item.rain)
  if (upcomingRain) {
    recommendations.push('Rain expected: Delay fertilizer application')
  } else {
    recommendations.push('No rain expected: Good time for field operations')
  }
  
  return recommendations
}