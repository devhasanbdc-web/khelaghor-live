export interface Channel {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  isCricket: boolean;
  isFootball: boolean;
  isFifa: boolean;
  isLive: boolean;
  country: string;
  countryCode: string; // e.g., 'bd', 'in', 'us', 'gb', 'pk', 'un'
  userAgent?: string;
  referrer?: string;
  origin?: string;
}

export type SportCategory = 'all' | 'running_live' | 'cricket' | 'football' | 'fifa' | 'other';
