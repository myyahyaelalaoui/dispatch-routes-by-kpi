import { describe, expect, it } from "vitest";
import type { KPIWeek, Route, Team } from "../../shared/src/types";
import {
  DEFAULT_SCORING_RULES,
  assignRoutesToTeams,
  computeQuotas,
  computeTeamScores,
  type ScoringRules,
} from "../src/dispatch";
import { assignmentsToCsv, quotasToCsv, simulateDummyData, teamScoresToCsv } from "../src/helpers";

describe("computeTeamScores", () => {
  it("returns KPI breakdown and total out of 80", () => {
    const input: KPIWeek[] = [
      {
        teamId: "a",
        driverScore: 99,
        fda: 99.7,
        delivery: 99.5,
        pur: 98.8,
        noAttempt: 0.05,
        other: 0.1,
      },
    ];

    const [score] = computeTeamScores(input);

    expect(score.maxScore).toBe(80);
    expect(score.totalScore).toBe(80);
    expect(score.breakdown.driverScore.points).toBe(20);
    expect(score.breakdown.noAttempt.points).toBe(10);
  });

  it("throws when scoring rules do not sum to 80", () => {
    const badRules = {
      ...DEFAULT_SCORING_RULES,
      other: {
        ...DEFAULT_SCORING_RULES.other,
        maxPoints: 11,
      },
    } satisfies ScoringRules;

    expect(() => computeTeamScores([], badRules)).toThrow(/total exactly 80/i);
  });
});

describe("computeQuotas", () => {
  const teams: Team[] = [
    { id: "t1", name: "T1", dailyCapacity: 100, priorityPostalPrefixes: ["100"] },
    { id: "t2", name: "T2", dailyCapacity: 100, priorityPostalPrefixes: ["101"] },
  ];

  it("weights quotas by KPI score and normalizes to total volume", () => {
    const scores = computeTeamScores([
      {
        teamId: "t1",
        driverScore: 99,
        fda: 99.7,
        delivery: 99.5,
        pur: 98.8,
        noAttempt: 0.05,
        other: 0.1,
      },
      {
        teamId: "t2",
        driverScore: 92,
        fda: 98.5,
        delivery: 98.5,
        pur: 97.2,
        noAttempt: 0.2,
        other: 0.35,
      },
    ]);

    const quotas = computeQuotas(teams, scores, 200);
    const sumTargets = quotas.reduce((sum, q) => sum + q.targetQuota, 0);

    expect(sumTargets).toBeCloseTo(200, 8);
    expect(quotas[0].targetQuota).toBeGreaterThan(quotas[1].targetQuota);
    expect(quotas[0].maxQuota).toBeCloseTo(120);
  });
});

describe("assignRoutesToTeams", () => {
  it("prefers matching prefixes while respecting max quota where possible", () => {
    const teams: Team[] = [
      { id: "north", name: "North", dailyCapacity: 100, priorityPostalPrefixes: ["100", "101"] },
      { id: "south", name: "South", dailyCapacity: 100, priorityPostalPrefixes: ["200", "201"] },
    ];

    const scores = computeTeamScores([
      {
        teamId: "north",
        driverScore: 99,
        fda: 99.7,
        delivery: 99.5,
        pur: 98.8,
        noAttempt: 0.05,
        other: 0.1,
      },
      {
        teamId: "south",
        driverScore: 95,
        fda: 99.3,
        delivery: 99,
        pur: 98,
        noAttempt: 0.1,
        other: 0.2,
      },
    ]);

    const routes: Route[] = [
      { routeId: "r1", postalPrefixes: ["100"], volume: 50 },
      { routeId: "r2", postalPrefixes: ["200"], volume: 50 },
      { routeId: "r3", postalPrefixes: ["100"], volume: 20 },
      { routeId: "r4", postalPrefixes: ["200"], volume: 20 },
    ];

    const quotas = computeQuotas(teams, scores, 140);
    const result = assignRoutesToTeams(routes, teams, scores, quotas);

    const r1 = result.assignments.find((a) => a.routeId === "r1");
    const r2 = result.assignments.find((a) => a.routeId === "r2");

    expect(r1?.teamId).toBe("north");
    expect(r2?.teamId).toBe("south");
    expect(result.assignedVolumeByTeam.north + result.assignedVolumeByTeam.south).toBe(140);
  });
});

describe("helpers", () => {
  it("builds deterministic dummy data and CSV exports", () => {
    const data = simulateDummyData({ teamCount: 2, routeCount: 3, seed: 7 });

    expect(data.teams).toHaveLength(2);
    expect(data.routes).toHaveLength(3);

    const scores = computeTeamScores(data.kpiWeeks);
    const quotas = computeQuotas(data.teams, scores, data.routes.reduce((sum, r) => sum + (r.volume ?? 1), 0));
    const assignments = assignRoutesToTeams(data.routes, data.teams, scores, quotas);

    expect(teamScoresToCsv(scores).split("\n")[0]).toContain("teamId,totalScore");
    expect(quotasToCsv(quotas).split("\n")[0]).toContain("baseQuota");
    expect(assignmentsToCsv(assignments).split("\n")[0]).toBe("routeId,teamId,volume");
  });
});
