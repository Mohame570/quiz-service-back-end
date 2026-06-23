import { Subject } from 'rxjs';

// Generic analytics event bus for server-sent events
export type AnalyticsEvent = {
  type: string;
  payload?: any;
};

export const analyticsEvents$ = new Subject<AnalyticsEvent>();
