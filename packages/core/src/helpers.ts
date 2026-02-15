import type { KPIWeek, Route, Team } from "../../shared/src/types";
import type { AssignmentResult, TeamQuota, TeamScore } from "./dispatch";

interface DummyDataConfig {
  teamCount?: number;
  routeCount?: number;
  seed?: number;
}

export interface DummyDataResult {
  teams: Team[];
  kpiWeeks: KPIWeek[];
  routes: Route[];
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 0x100000000;
    return state / 0x100000000;
  };
}

const PREFIXES = ["100", "101", "102", "103", "104", "105", "106", "107", "108", "109"];

export function simulateDummyData(config: DummyDataConfig = {}): DummyDataResult {
  const teamCount = config.teamCount ?? 4;
  const routeCount = config.routeCount ?? 20;
  const random = createSeededRandom(config.seed ?? 42);

  const teams: Team[] = Array.from({ length: teamCount }, (_, idx) => {
    const id = `team-${idx + 1}`;
    const priorityPostalPrefixes = PREFIXES.filter(() => random() > 0.6).slice(0, 3);
    return {
      id,
      name: `Team ${idx + 1}`,
      dailyCapacity: 80 + Math.round(random() * 120),
      capPercent: 0.2,
      priorityPostalPrefixes: priorityPostalPrefixes.length > 0 ? priorityPostalPrefixes : [PREFIXES[idx % PREFIXES.length]],
    };
  });

  const kpiWeeks: KPIWeek[] = teams.map((team) => ({
    teamId: team.id,
    driverScore: 92 + random() * 8,
    fda: 98.5 + random() * 1.4,
    delivery: 98.2 + random() * 1.5,
    pur: 97 + random() * 2,
    noAttempt: random() * 0.2,
    other: random() * 0.25,
  }));

  const routes: Route[] = Array.from({ length: routeCount }, (_, idx) => {
    const shuffled = [...PREFIXES].sort(() => random() - 0.5);
    return {
      routeId: `route-${idx + 1}`,
      postalPrefixes: shuffled.slice(0, 1 + Math.floor(random() * 2)),
      volume: 5 + Math.round(random() * 25),
    };
  });

  return {
    teams,
    kpiWeeks,
    routes,
  };
}

function csvEscape(value: string | number): string {
  const asString = String(value);
  if (/[",\n]/.test(asString)) {
    return `"${asString.replace(/"/g, '""')}"`;
  }
  return asString;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const headerLine = headers.map(csvEscape).join(",");
  const rowLines = rows.map((row) => row.map(csvEscape).join(","));
  return [headerLine, ...rowLines].join("\n");
}

export function teamScoresToCsv(teamScores: TeamScore[]): string {
  return toCsv(
    ["teamId", "totalScore", "driverScore", "fda", "delivery", "pur", "noAttempt", "other"],
    teamScores.map((score) => [
      score.teamId,
      score.totalScore,
      score.breakdown.driverScore.points,
      score.breakdown.fda.points,
      score.breakdown.delivery.points,
      score.breakdown.pur.points,
      score.breakdown.noAttempt.points,
      score.breakdown.other.points,
    ]),
  );
}

export function quotasToCsv(quotas: TeamQuota[]): string {
  return toCsv(
    ["teamId", "baseQuota", "targetQuota", "minQuota", "maxQuota"],
    quotas.map((quota) => [quota.teamId, quota.baseQuota, quota.targetQuota, quota.minQuota, quota.maxQuota]),
  );
}

export function assignmentsToCsv(result: AssignmentResult): string {
  return toCsv(
    ["routeId", "teamId", "volume"],
    result.assignments.map((assignment) => [assignment.routeId, assignment.teamId, assignment.volume]),
  );
}
