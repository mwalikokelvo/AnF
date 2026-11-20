//! Kevo weather via Open-Meteo (free, no key, non-commercial).
//! Geocoding + current conditions. Attribution required in UI.

use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherReport {
    pub location: String,
    pub temperature_c: f32,
    pub weather_code: i32,
    pub description: String,
    pub timezone: String,
}

#[derive(Deserialize)]
struct GeoResult {
    results: Option<Vec<GeoItem>>,
}

#[derive(Deserialize)]
struct GeoItem {
    name: String,
    latitude: f64,
    longitude: f64,
    country: Option<String>,
}

#[derive(Deserialize)]
struct Forecast {
    current: Option<Current>,
    timezone: Option<String>,
}

#[derive(Deserialize)]
struct Current {
    temperature_2m: f32,
    weather_code: i32,
}

fn weather_description(code: i32) -> &'static str {
    match code {
        0 => "clear sky",
        1..=3 => "partly cloudy",
        45 | 48 => "fog",
        51..=67 => "rain",
        71..=77 => "snow",
        80..=82 => "rain showers",
        95..=99 => "thunderstorm",
        _ => "unknown conditions",
    }
}

/// Fetch current weather for a city name. Returns error on network or no results.
pub async fn weather_for_city(city: &str) -> Result<WeatherReport, String> {
    let city = city.trim();
    if city.is_empty() || city.len() > 100 {
        return Err("Please give a city name under 100 characters.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("AnF-Kevo/1.0 (weather lookup; non-commercial)")
        .build()
        .map_err(|e| e.to_string())?;

    // Geocode
    let geo_url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        urlencoding::encode(city)
    );
    let geo: GeoResult = client
        .get(&geo_url)
        .send()
        .await
        .map_err(|e| format!("Geocoding failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Bad geocoding response: {e}"))?;

    let Some(item) = geo.results.and_then(|r| r.into_iter().next()) else {
        return Err(format!("No place found for '{city}'."));
    };

    let loc = if let Some(c) = &item.country {
        format!("{} ({})", item.name, c)
    } else {
        item.name.clone()
    };

    // Forecast
    let fc_url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,weather_code&timezone=auto",
        item.latitude, item.longitude
    );
    let fc: Forecast = client
        .get(&fc_url)
        .send()
        .await
        .map_err(|e| format!("Weather fetch failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Bad weather response: {e}"))?;

    let Some(cur) = fc.current else {
        return Err("No current weather data.".into());
    };

    Ok(WeatherReport {
        location: loc,
        temperature_c: cur.temperature_2m,
        weather_code: cur.weather_code,
        description: weather_description(cur.weather_code).to_string(),
        timezone: fc.timezone.unwrap_or_else(|| "UTC".into()),
    })
}

#[tauri::command]
pub async fn kevo_weather(city: String) -> Result<WeatherReport, String> {
    weather_for_city(&city).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn description_mapping() {
        assert_eq!(weather_description(0), "clear sky");
        assert_eq!(weather_description(61), "rain");
        assert_eq!(weather_description(95), "thunderstorm");
        assert_eq!(weather_description(999), "unknown conditions");
    }

    #[test]
    fn empty_city_rejected() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let err = rt.block_on(weather_for_city("")).unwrap_err();
        assert!(err.contains("city name"));
    }
}
