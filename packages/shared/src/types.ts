export interface Team {
  id: string;
  name: string;
  dailyCapacity: number;
  capPercent?: number;
  priorityPostalPrefixes: string[];
}

export interface KPIWeek {
  teamId: string;
  driverScore: number;
  fda: number;
  delivery: number;
  pur: number;
  noAttempt: number;
  other: number;
}

export interface Route {
  routeId: string;
  postalPrefixes: string[];
  volume?: number;
}
