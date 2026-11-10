/**
 * JARVIS Ads Analytics Connector (Meta Ads compatible)
 * Tracks ad spend, ROAS, CPM, CTR across campaigns.
 * Demo values from Cindy Zhu video: $475 spend, 1.5x ROAS.
 * Offline-first; real Meta API calls are gated behind onlineLookupsEnabled().
 */
import { onlineLookupsEnabled } from '../../online-lookups';

export interface AdCampaignStats {
  totalSpend: number;         // USD cents
  roas: number;               // Return on ad spend (revenue / spend)
  impressions: number;
  clicks: number;
  ctr: number;                // Click-through rate 0-1
  cpm: number;                // Cost per 1000 impressions, USD cents
  conversions: number;
  costPerConversion: number;  // USD cents
  activeCampaigns: number;
  currency: string;
  period: '7d' | '30d';
  lastUpdated: number;
  isDemo: boolean;
}

const DEMO_STATS: Readonly<AdCampaignStats> = {
  totalSpend: 47_500,     // $475.00
  roas: 1.5,
  impressions: 142_000,
  clicks: 4_260,
  ctr: 0.03,
  cpm: 334,               // ~$3.34 CPM
  conversions: 318,
  costPerConversion: 14937, // ~$149.37 per paying customer
  activeCampaigns: 3,
  currency: 'USD',
  period: '7d',
  lastUpdated: Date.now(),
  isDemo: true,
};

export function formatAdSpend(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export class AdsConnector {
  private accessToken: string | null;
  private adAccountId: string | null;
  private demoMode: boolean;
  private cachedStats: AdCampaignStats | null = null;
  private cacheExpiresAt = 0;

  constructor(accessToken?: string, adAccountId?: string) {
    this.accessToken = accessToken ?? null;
    this.adAccountId = adAccountId ?? null;
    this.demoMode = !accessToken || !adAccountId;
  }

  setCredentials(accessToken: string, adAccountId: string): void {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId;
    this.demoMode = false;
    this.cachedStats = null;
    this.cacheExpiresAt = 0;
  }

  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
  }

  async getStats(period: '7d' | '30d' = '7d'): Promise<AdCampaignStats> {
    if (this.demoMode || !this.accessToken) {
      return { ...DEMO_STATS, period, lastUpdated: Date.now() };
    }
    if (!onlineLookupsEnabled()) {
      return { ...DEMO_STATS, period, isDemo: true, lastUpdated: Date.now() };
    }
    if (this.cachedStats && this.cachedStats.period === period && Date.now() < this.cacheExpiresAt) {
      return this.cachedStats;
    }
    const result = await this._fetchMeta(period);
    this.cachedStats = result;
    this.cacheExpiresAt = Date.now() + 15 * 60 * 1000; // 15 min cache
    return result;
  }

  private async _fetchMeta(period: '7d' | '30d'): Promise<AdCampaignStats> {
    if (!this.accessToken || !this.adAccountId) {
      return { ...DEMO_STATS, period, lastUpdated: Date.now() };
    }
    const datePreset = period === '7d' ? 'last_7_days' : 'last_30_days';
    const fields = 'spend,impressions,clicks,ctr,cpm,actions,cost_per_action_type';
    const url = `https://graph.facebook.com/v19.0/act_${this.adAccountId}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${this.accessToken}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Meta API ${res.status}`);
      const data = await res.json() as { data?: Array<Record<string, unknown>> };
      const row = data.data?.[0] ?? {};
      const spendUsd = parseFloat(row.spend as string ?? '0');
      const conversions = (row.actions as Array<{ action_type: string; value: string }> ?? [])
        .find(a => a.action_type === 'purchase')?.value;
      const convCount = parseFloat(conversions ?? '0');
      const revenue = convCount > 0 ? convCount * 150 : 0; // estimate $150/conversion
      return {
        totalSpend: Math.round(spendUsd * 100),
        roas: spendUsd > 0 ? revenue / spendUsd : 0,
        impressions: parseInt(row.impressions as string ?? '0'),
        clicks: parseInt(row.clicks as string ?? '0'),
        ctr: parseFloat(row.ctr as string ?? '0') / 100,
        cpm: Math.round(parseFloat(row.cpm as string ?? '0') * 100),
        conversions: convCount,
        costPerConversion: convCount > 0 ? Math.round((spendUsd / convCount) * 100) : 0,
        activeCampaigns: 1,
        currency: 'USD',
        period,
        lastUpdated: Date.now(),
        isDemo: false,
      };
    } catch {
      return { ...DEMO_STATS, period, lastUpdated: Date.now() };
    }
  }
}
