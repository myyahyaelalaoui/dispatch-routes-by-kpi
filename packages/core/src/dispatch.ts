import type { KPIWeek, Route, Team } from "../../shared/src/types";

export type KPIKey = Exclude<keyof KPIWeek, "teamId">;

export interface ThresholdRule {
  value: number;
  points: number;
}

export interface KPIScoringRule {
  direction: "higher" | "lower";
  maxPoints: number;
  thresholds: ThresholdRule[];
}

export type ScoringRules = Record<KPIKey, KPIScoringRule>;

export interface ScoreBreakdownEntry {
  value: number;
  points: number;
  maxPoints: number;
}

export interface TeamScore {
  teamId: string;
  totalScore: number;
  maxScore: number;
  breakdown: Record<KPIKey, ScoreBreakdownEntry>;
}

export interface TeamQuota {
  teamId: string;
  baseQuota: number;
  targetQuota: number;
  minQuota: number;
  maxQuota: number;
}

export interface RouteAssignment {
  routeId: string;
  teamId: string;
  volume: number;
}

export interface AssignmentResult {
  assignments: RouteAssignment[];
  assignedVolumeByTeam: Record<string, number>;
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  driverScore: {
    direction: "higher",
    maxPoints: 20,
    thresholds: [
      { value: 99, points: 20 },
      { value: 97, points: 16 },
      { value: 95, points: 12 },
      { value: 92, points: 8 },
      { value: 0, points: 0 },
    ],
  },
  fda: {
    direction: "higher",
    maxPoints: 15,
    thresholds: [
      { value: 99.7, points: 15 },
      { value: 99.3, points: 11 },
      { value: 98.8, points: 7 },
      { value: 0, points: 0 },
    ],
  },
  delivery: {
    direction: "higher",
    maxPoints: 15,
    thresholds: [
      { value: 99.5, points: 15 },
      { value: 99, points: 11 },
      { value: 98.5, points: 7 },
      { value: 0, points: 0 },
    ],
  },
  pur: {
    direction: "higher",
    maxPoints: 10,
    thresholds: [
      { value: 98.8, points: 10 },
      { value: 98.0, points: 7 },
      { value: 97.2, points: 4 },
      { value: 0, points: 0 },
    ],
  },
  noAttempt: {
    direction: "lower",
    maxPoints: 10,
    thresholds: [
      { value: 0.05, points: 10 },
      { value: 0.1, points: 8 },
      { value: 0.2, points: 5 },
      { value: Number.POSITIVE_INFINITY, points: 0 },
    ],
  },
  other: {
    direction: "lower",
    maxPoints: 10,
    thresholds: [
      { value: 0.1, points: 10 },
      { value: 0.2, points: 7 },
      { value: 0.35, points: 4 },
      { value: Number.POSITIVE_INFINITY, points: 0 },
    ],
  },
};

const KPI_KEYS: KPIKey[] = ["driverScore", "fda", "delivery", "pur", "noAttempt", "other"];

function validateScoringRules(rules: ScoringRules): void {
  const total = KPI_KEYS.reduce((sum, kpi) => sum + rules[kpi].maxPoints, 0);
  if (total !== 80) {
    throw new Error(`Scoring rules must total exactly 80 points; received ${total}.`);
  }

  for (const kpi of KPI_KEYS) {
    const rule = rules[kpi];
    for (const threshold of rule.thresholds) {
      if (threshold.points < 0 || threshold.points > rule.maxPoints) {
        throw new Error(`Invalid points for KPI '${kpi}'.`);
      }
    }
  }
}

function evaluateThreshold(value: number, rule: KPIScoringRule): number {
  if (rule.direction === "higher") {
    const ordered = [...rule.thresholds].sort((a, b) => b.value - a.value);
    const match = ordered.find((t) => value >= t.value);
    return match?.points ?? 0;
  }

  const ordered = [...rule.thresholds].sort((a, b) => a.value - b.value);
  const match = ordered.find((t) => value <= t.value);
  return match?.points ?? 0;
}

export function computeTeamScores(
  weeks: KPIWeek[],
  rules: ScoringRules = DEFAULT_SCORING_RULES,
): TeamScore[] {
  validateScoringRules(rules);

  return weeks.map((week) => {
    const breakdown = {} as Record<KPIKey, ScoreBreakdownEntry>;
    let totalScore = 0;

    for (const kpi of KPI_KEYS) {
      const value = week[kpi];
      const points = evaluateThreshold(value, rules[kpi]);
      breakdown[kpi] = {
        value,
        points,
        maxPoints: rules[kpi].maxPoints,
      };
      totalScore += points;
    }

    return {
      teamId: week.teamId,
      totalScore,
      maxScore: 80,
      breakdown,
    };
  });
}

export function computeQuotas(
  teams: Team[],
  teamScores: TeamScore[],
  totalVolume: number,
): TeamQuota[] {
  if (totalVolume <= 0) {
    throw new Error("totalVolume must be greater than 0");
  }

  const scoreMap = new Map(teamScores.map((item) => [item.teamId, item.totalScore]));
  const totalCapacity = teams.reduce((sum, t) => sum + t.dailyCapacity, 0);

  const weighted = teams.map((team) => {
    const capPercent = team.capPercent ?? 0.2;
    const performanceBoost = (scoreMap.get(team.id) ?? 0) / 80;
    const baseShare = team.dailyCapacity / totalCapacity;
    const baseQuota = baseShare * totalVolume;
    const boostedQuota = baseQuota * (1 + capPercent * performanceBoost);

    return {
      team,
      capPercent,
      baseQuota,
      boostedQuota,
    };
  });

  const weightedSum = weighted.reduce((sum, item) => sum + item.boostedQuota, 0);

  return weighted.map(({ team, capPercent, baseQuota, boostedQuota }) => {
    const targetQuota = (boostedQuota / weightedSum) * totalVolume;
    return {
      teamId: team.id,
      baseQuota,
      targetQuota,
      minQuota: Math.max(0, baseQuota * (1 - capPercent)),
      maxQuota: baseQuota * (1 + capPercent),
    };
  });
}

function countPrefixMatches(route: Route, team: Team): number {
  const priority = new Set(team.priorityPostalPrefixes);
  return route.postalPrefixes.reduce((sum, prefix) => sum + (priority.has(prefix) ? 1 : 0), 0);
}

export function assignRoutesToTeams(
  routes: Route[],
  teams: Team[],
  teamScores: TeamScore[],
  quotas: TeamQuota[],
): AssignmentResult {
  const scoreMap = new Map(teamScores.map((score) => [score.teamId, score.totalScore]));
  const quotaMap = new Map(quotas.map((q) => [q.teamId, q]));
  const assignedVolumeByTeam: Record<string, number> = Object.fromEntries(teams.map((t) => [t.id, 0]));

  const sortedRoutes = [...routes].sort((a, b) => (b.volume ?? 1) - (a.volume ?? 1));
  const assignments: RouteAssignment[] = [];

  for (const route of sortedRoutes) {
    const volume = route.volume ?? 1;

    const ranked = teams
      .map((team) => {
        const quota = quotaMap.get(team.id);
        if (!quota) {
          throw new Error(`Missing quota for team '${team.id}'.`);
        }

        const matches = countPrefixMatches(route, team);
        const kpiScore = scoreMap.get(team.id) ?? 0;
        const current = assignedVolumeByTeam[team.id];
        const projected = current + volume;
        const withinMax = projected <= quota.maxQuota;

        return {
          team,
          score: matches * 100 + kpiScore,
          withinMax,
          projectedOverage: Math.max(0, projected - quota.maxQuota),
          utilization: quota.targetQuota > 0 ? projected / quota.targetQuota : Number.POSITIVE_INFINITY,
        };
      })
      .sort((a, b) => {
        if (a.withinMax !== b.withinMax) {
          return a.withinMax ? -1 : 1;
        }
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        if (a.utilization !== b.utilization) {
          return a.utilization - b.utilization;
        }
        return a.projectedOverage - b.projectedOverage;
      });

    const chosen = ranked[0];
    assignedVolumeByTeam[chosen.team.id] += volume;
    assignments.push({
      routeId: route.routeId,
      teamId: chosen.team.id,
      volume,
    });
  }

  return {
    assignments,
    assignedVolumeByTeam,
  };
}
