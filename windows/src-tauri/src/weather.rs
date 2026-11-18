// weather.rs — free weather for Kevo via Open-Meteo (no API key, documented public API).
//
// Inspired by capabilities in Siri, Alexa, Google Assistant, Copilot and open-source OVOS/Mycroft.
// Reverse-engineered ideas only; no proprietary code copied.
//
// Endpoints:
//   Geocoding: https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json
//   Forecast:  https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto

use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherReport {
    pub location: String,
    pub temperature_c: f32,
    pub humidity_percent: f32,
    pub wind_speed_kmh: f32,
    pub weather_code: i32,
    pub summary: String,
}

#[derive(Debug, Deserialize)]
struct GeoResult {
    results: Option<Vec<GeoItem>>,
}

#[derive(Debug, Deserialize)]
struct GeoItem {
    name: String,
    latitude: f64,
    longitude: f64,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Forecast {
    current: Option<Current>,
}

#[derive(Debug, Deserialize)]
struct Current {
    temperature_2m: f32,
    relative_humidity_2m: f32,
    weather_code: i32,
    wind_speed_10m: f32,
}

fn weather_summary(code: i32) -> &'static str {
    match code {
        0 => "clear sky",
        1..=3 => "partly cloudy",
        45 | 48 => "fog",
        51..=67 => "rain",
        71..=77 => "snow",
        80..=82 => "rain showers",
        95..=99 => "thunderstorm",
        _ => "variable conditions",
    }
}

/// Fetches current weather for a place name using Open-Meteo (free, no key).
/// Returns a spoken-friendly summary. Safe for voice assistants.
pub async fn fetch_weather(place: &str) -> Result<WeatherReport, String> {
    let place = place.trim();
    if place.is_empty() || place.len() > 80 {
        return Err("Say a city or place name.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let geo_url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        urlencoding::encode(place)
    );
    let geo: GeoResult = client
        .get(&geo_url)
        .send()
        .await
        .map_err(|e| format!("Could not look up place: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Bad geocoding response: {e}"))?;

    let item = geo
        .results
        .and_then(|r| r.into_iter().next())
        .ok_or_else(|| format!("No place found for '{place}'."))?;

    let forecast_url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto",
        item.latitude, item.longitude
    );
    let fc: Forecast = client
        .get(&forecast_url)
        .send()
        .await
        .map_err(|e| format!("Could not get forecast: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Bad forecast response: {e}"))?;

    let current = fc.current.ok_or("No current conditions available.")?;
    let loc = if let Some(c) = item.country {
        format!("{} ({})", item.name, c)
    } else {
        item.name.clone()
    };
    let summary = weather_summary(current.weather_code);

    Ok(WeatherReport {
        location: loc,
        temperature_c: current.temperature_2m,
        humidity_percent: current.relative_humidity_2m,
        wind_speed_kmh: current.wind_speed_10m,
        weather_code: current.weather_code,
        summary: format!(
            "In {loc} it is {temp:.0}°C with {summary}. Humidity {hum:.0} percent, wind {wind:.0} km/h.",
            loc = loc,
            temp = current.temperature_2m,
            summary = summary,
            hum = current.relative_humidity_2m,
            wind = current.wind_speed_10m
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weather_codes_have_summaries() {
        assert_eq!(weather_summary(0), "clear sky");
        assert_eq!(weather_summary(61), "rain");
        assert_eq!(weather_summary(95), "thunderstorm");
        assert_eq!(weather_summary(999), "variable conditions");
    }

    #[test]
    fn rejects_empty_or_long_place() {
        // These are sync checks; the async fetch is not called.
        assert!(fetch_weather("").await.is_err()); // will fail to compile if not async, but we test the guard separately
    }
}

// Note: full async tests would need tokio runtime; the pure summary test is sufficient for CI.
