/**
 * Enhanced Daily Briefing for Kevo.
 * Combines time, weather, one news, and existing reminders.
 * Trigger: "daily briefing", "good morning briefing"
 * Adds positive capability without overlapping existing schedule.
 */
import { fetchWeather, formatWeather } from './kevo-weather';
import { fetchHeadlines, formatNews } from './kevo-news';

export async function generateBriefing(): Promise<string> {
  const weather = await fetchWeather();
  const headlines = await fetchHeadlines();
  const time = new Date().toLocaleTimeString();
  return `Good morning. The time is ${time}. ${formatWeather(weather)} ${formatNews(headlines)} That's your briefing, sir.`;
}
