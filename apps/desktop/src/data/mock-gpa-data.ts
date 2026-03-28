import type {
  AppSnapshot,
  ImportKind,
  ImportWorkbenchResult,
  PlanningTargetResult,
  ScenarioType,
} from "@/types/domain";

export const mockSnapshot: AppSnapshot = {
  summary: {
    currentGpa: "3.684",
    countedCreditSum: "23.0",
    countedCourseCount: 6,
    qualityPointSum: "84.732",
  },
  courses: [
    {
      id: "course-1",
      name: "Advanced Mathematics",
      semester: "2024秋",
      credit: "4.0",
      status: "COMPLETED",
      scoreType: "PERCENTAGE",
      note: "核心基础课",
      hasScore: true,
      rawScore: "92",
      gradePoint: "3.820",
    },
    {
      id: "course-2",
      name: "College English",
      semester: "2024秋",
      credit: "2.0",
      status: "COMPLETED",
      scoreType: "PERCENTAGE",
      note: null,
      hasScore: true,
      rawScore: "88",
      gradePoint: "3.460",
    },
    {
      id: "course-3",
      name: "Data Structures",
      semester: "2025春",
      credit: "3.5",
      status: "COMPLETED",
      scoreType: "PERCENTAGE",
      note: "专业核心",
      hasScore: true,
      rawScore: "90",
      gradePoint: "3.640",
    },
    {
      id: "course-4",
      name: "Discrete Mathematics",
      semester: "2025春",
      credit: "3.0",
      status: "COMPLETED",
      scoreType: "PERCENTAGE",
      note: null,
      hasScore: true,
      rawScore: "87",
      gradePoint: "3.370",
    },
    {
      id: "course-5",
      name: "Operating Systems",
      semester: "2025秋",
      credit: "4.0",
      status: "PLANNED",
      scoreType: "PERCENTAGE",
      note: "高权重提升空间",
      hasScore: false,
      rawScore: null,
      gradePoint: null,
    },
    {
      id: "course-6",
      name: "Computer Networks",
      semester: "2025秋",
      credit: "3.0",
      status: "PLANNED",
      scoreType: "PERCENTAGE",
      note: null,
      hasScore: false,
      rawScore: null,
      gradePoint: null,
    },
    {
      id: "course-7",
      name: "Database Systems",
      semester: "2026春",
      credit: "3.5",
      status: "PLANNED",
      scoreType: "PERCENTAGE",
      note: "与桌面端方向联动",
      hasScore: false,
      rawScore: null,
      gradePoint: null,
    },
    {
      id: "course-8",
      name: "Innovation Practice",
      semester: "2026春",
      credit: "2.0",
      status: "COMPLETED",
      scoreType: "GRADE",
      note: "等级制",
      hasScore: false,
      rawScore: null,
      gradePoint: null,
    },
  ],
  latestPlanning: {
    targetId: "target-1",
    targetGpa: "3.820",
    basedOnCurrentGpa: "3.684",
    basedOnCompletedCreditSum: "23.0",
    plannedCreditSum: "10.5",
    requiredFutureAverageGp: "3.910",
    requiredScoreText: "若按百分制估算，剩余课程平均至少约需 93.6 分。",
    feasible: true,
    infeasibleReason: null,
    scenarios: [
      {
        scenarioId: "optimistic",
        scenarioType: "OPTIMISTIC",
        simulatedFinalGpa: "3.910",
        requiredFutureAverageGp: "3.910",
        coveredPlannedCredit: "10.5",
        isFullCoverage: true,
        expectationCount: 3,
      },
      {
        scenarioId: "neutral",
        scenarioType: "NEUTRAL",
        simulatedFinalGpa: "3.826",
        requiredFutureAverageGp: "3.910",
        coveredPlannedCredit: "10.5",
        isFullCoverage: true,
        expectationCount: 3,
      },
      {
        scenarioId: "conservative",
        scenarioType: "CONSERVATIVE",
        simulatedFinalGpa: "3.741",
        requiredFutureAverageGp: "3.910",
        coveredPlannedCredit: "10.5",
        isFullCoverage: true,
        expectationCount: 3,
      },
    ],
  },
  importTemplates: {
    courseTextExample: [
      "course_name=Operating Systems;semester=2025秋;credit=4.0;status=PLANNED;score_type=PERCENTAGE;note=核心课",
      "course_name=Computer Networks;semester=2025秋;credit=3.0;status=PLANNED;score_type=PERCENTAGE",
    ].join("\n"),
    scoreTextExample: [
      "course_name=Advanced Mathematics;semester=2024秋;raw_score=92",
      "course_name=College English;semester=2024秋;raw_score=88",
    ].join("\n"),
  },
};

export function buildMockPlanningTarget(targetGpa: string): PlanningTargetResult {
  const normalized = Number(targetGpa || "3.82").toFixed(3);
  const scenarios: Array<{ type: ScenarioType; delta: number }> = [
    { type: "OPTIMISTIC", delta: 0.08 },
    { type: "NEUTRAL", delta: 0 },
    { type: "CONSERVATIVE", delta: -0.09 },
  ];

  return {
    ...mockSnapshot.latestPlanning!,
    targetId: `mock-target-${targetGpa}`,
    targetGpa: normalized,
    requiredFutureAverageGp: Math.min(Number(normalized) + 0.09, 4).toFixed(3),
    requiredScoreText: `若按百分制估算，剩余课程平均至少约需 ${(Number(normalized) * 24.4).toFixed(1)} 分。`,
    scenarios: scenarios.map(({ type, delta }) => ({
      scenarioId: `${type.toLowerCase()}-${normalized}`,
      scenarioType: type,
      simulatedFinalGpa: Math.max(Number(normalized) + delta, 0).toFixed(3),
      requiredFutureAverageGp: Math.min(Number(normalized) + 0.09, 4).toFixed(3),
      coveredPlannedCredit: "10.5",
      isFullCoverage: true,
      expectationCount: 3,
    })),
  };
}

export function buildMockImportResult(kind: ImportKind, text: string, applied: boolean): ImportWorkbenchResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const invalidLine = lines.find((line) => !line.includes("="));
  const errorCount = invalidLine ? 1 : 0;

  return {
    kind,
    parsedCount: lines.length,
    validCount: Math.max(lines.length - errorCount, 0),
    skippedCount: 0,
    errorCount,
    applied: applied && errorCount === 0,
    importedIdentifiers: applied && errorCount === 0 ? lines.slice(0, 3) : [],
    skipped: [],
    errors:
      errorCount === 0
        ? []
        : [
            {
              lineNumber: lines.indexOf(invalidLine!) + 1,
              identifier: invalidLine!,
              message: "Malformed segment. Each field must use key=value.",
            },
          ],
  };
}
