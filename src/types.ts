export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  country: string;
  countryCode: string;
  isLive: boolean;
  isCricket: boolean;
  isFootball: boolean;
  isFifa: boolean;
}

export type SportCategory = 'all' | 'running_live' | 'cricket' | 'football' | 'fifa' | 'other';
