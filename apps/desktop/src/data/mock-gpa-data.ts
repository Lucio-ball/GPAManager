import type {
  AppSnapshot,
  CourseDeleteResult,
  CourseRecord,
  CourseUpsertPayload,
  GpaSummary,
  ImportKind,
  ImportWorkbenchResult,
  PlanningExpectationSavePayload,
  PlanningScenarioExpectation,
  PlanningScenarioResult,
  PlanningTargetResult,
  ScenarioType,
  ScoreType,
  ScoreUpsertPayload,
} from "@/types/domain";

const GRADE_POINT_LABELS = {
  excellent: "\u4f18",
  good: "\u826f\u597d",
  medium: "\u4e2d\u7b49",
  pass: "\u53ca\u683c",
  fail: "\u4e0d\u53ca\u683c",
} as const;

const GRADE_POINT_MAP: Record<string, number> = {
  [GRADE_POINT_LABELS.excellent]: 4.0,
  "\u4f18\u79c0": 4.0,
  [GRADE_POINT_LABELS.good]: 3.5,
  [GRADE_POINT_LABELS.medium]: 2.8,
  [GRADE_POINT_LABELS.pass]: 1.7,
  [GRADE_POINT_LABELS.fail]: 0,
};

const SCORE_TEXT_BY_THRESHOLD = [
  { max: 1.0, text: "60 \u5206" },
  { max: 4.0, text: null },
] as const;

type MockState = {
  courses: CourseRecord[];
  latestPlanning: PlanningTargetResult | null;
  nextCourseId: number;
  nextTargetId: number;
};

type PlanningBaseline = {
  summary: GpaSummary;
  plannedCourses: CourseRecord[];
  plannedCreditSum: number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatFixed(value: number, digits: number) {
  return value.toFixed(digits);
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeSemester(value: string) {
  return value.trim();
}

function assertSemester(value: string) {
  if (!/^\d{4}[\u6625\u590f\u79cb\u51ac]$/u.test(value.trim())) {
    throw new Error("\u5b66\u671f\u683c\u5f0f\u9700\u4e3a YYYY+\u6625/\u590f/\u79cb/\u51ac\uff0c\u4f8b\u5982 2026\u6625\u3002");
  }
}

function assertCredit(value: string) {
  const credit = Number(value);
  if (!Number.isFinite(credit) || credit <= 0) {
    throw new Error("\u5b66\u5206\u5fc5\u987b\u662f\u5927\u4e8e 0 \u7684\u6570\u5b57\u3002");
  }
  return formatFixed(credit, 1);
}

function getCourseIndex(courseId: string) {
  const index = mockState.courses.findIndex((course) => course.id === courseId);
  if (index < 0) {
    throw new Error("\u8bfe\u7a0b\u4e0d\u5b58\u5728\u3002");
  }
  return index;
}

function getCourse(courseId: string) {
  return mockState.courses[getCourseIndex(courseId)];
}

function assertDuplicateCourse(name: string, semester: string, courseId?: string) {
  const duplicate = mockState.courses.find(
    (course) =>
      course.name === name &&
      course.semester === semester &&
      (courseId === undefined || course.id !== courseId),
  );
  if (duplicate) {
    throw new Error("\u540c\u4e00\u5b66\u671f\u5df2\u7ecf\u5b58\u5728\u540c\u540d\u8bfe\u7a0b\u3002");
  }
}

function convertToGradePoint(scoreType: ScoreType, rawScore: string) {
  const normalizedScore = rawScore.trim();
  if (!normalizedScore) {
    throw new Error("\u6210\u7ee9\u4e0d\u80fd\u4e3a\u7a7a\u3002");
  }

  if (scoreType === "PERCENTAGE") {
    const score = Number(normalizedScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error("\u767e\u5206\u5236\u6210\u7ee9\u5fc5\u987b\u5728 0 \u5230 100 \u4e4b\u95f4\u3002");
    }
    if (score < 60) {
      return "0.000";
    }
    const gradePoint = 4 - (3 * (100 - score) * (100 - score)) / 1600;
    return formatFixed(gradePoint, 3);
  }

  const mapped = GRADE_POINT_MAP[normalizedScore];
  if (mapped === undefined) {
    throw new Error(
      "\u7b49\u7ea7\u5236\u4ec5\u652f\u6301\uff1a\u4f18\u3001\u826f\u597d\u3001\u4e2d\u7b49\u3001\u53ca\u683c\u3001\u4e0d\u53ca\u683c\u3002",
    );
  }
  return formatFixed(mapped, 3);
}

function sortCourses(courses: CourseRecord[]) {
  return [...courses].sort(
    (left, right) =>
      left.semester.localeCompare(right.semester, "zh-Hans-CN") ||
      left.name.localeCompare(right.name, "zh-Hans-CN"),
  );
}

function calculateSummary(courses: CourseRecord[]): GpaSummary {
  const completedWithScores = courses.filter(
    (course) => course.status === "COMPLETED" && course.hasScore && course.gradePoint !== null,
  );

  const countedCreditSum = completedWithScores.reduce(
    (sum, course) => sum + Number(course.credit),
    0,
  );
  const qualityPointSum = completedWithScores.reduce(
    (sum, course) => sum + Number(course.credit) * Number(course.gradePoint),
    0,
  );

  return {
    currentGpa: countedCreditSum > 0 ? formatFixed(qualityPointSum / countedCreditSum, 3) : null,
    countedCreditSum: formatFixed(countedCreditSum, 1),
    countedCourseCount: completedWithScores.length,
    qualityPointSum: formatFixed(qualityPointSum, 3),
  };
}

function getPlanningBaseline(courses: CourseRecord[]): PlanningBaseline {
  const plannedCourses = courses.filter((course) => course.status === "PLANNED");
  const plannedCreditSum = plannedCourses.reduce((sum, course) => sum + Number(course.credit), 0);
  return {
    summary: calculateSummary(courses),
    plannedCourses,
    plannedCreditSum,
  };
}

function getRequiredFutureAverage(targetGpa: number, baseline: PlanningBaseline) {
  const currentGpa = Number(baseline.summary.currentGpa ?? "0");
  const completedCreditSum = Number(baseline.summary.countedCreditSum);
  const qualityPointSum = Number(baseline.summary.qualityPointSum);

  if (baseline.plannedCreditSum === 0) {
    if (completedCreditSum > 0 && currentGpa >= targetGpa) {
      return {
        requiredFutureAverageGp: "0.000",
        feasible: true,
        infeasibleReason:
          "\u5f53\u524d GPA \u5df2\u8fbe\u6807\uff0c\u4e14\u6ca1\u6709\u5269\u4f59\u672a\u4fee\u8bfe\u7a0b\u3002",
      };
    }
    return {
      requiredFutureAverageGp: null,
      feasible: false,
      infeasibleReason:
        "\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u4e8e\u89c4\u5212\u7684\u672a\u4fee\u8bfe\u7a0b\uff0c\u65e0\u6cd5\u7ee7\u7eed\u5012\u63a8\u3002",
    };
  }

  const requiredGp =
    (targetGpa * (completedCreditSum + baseline.plannedCreditSum) - qualityPointSum) /
    baseline.plannedCreditSum;

  if (requiredGp <= 0) {
    return {
      requiredFutureAverageGp: "0.000",
      feasible: true,
      infeasibleReason: "\u5f53\u524d GPA \u5df2\u8fbe\u6807\u6216\u8d85\u8fc7\u76ee\u6807\u3002",
    };
  }

  if (requiredGp > 4) {
    return {
      requiredFutureAverageGp: formatFixed(requiredGp, 3),
      feasible: false,
      infeasibleReason:
        "\u6309\u73b0\u6709\u89c4\u5219\uff0c\u5269\u4f59\u8bfe\u7a0b\u5e73\u5747\u7ee9\u70b9\u9700\u8981\u8d85\u8fc7 4.0\uff0c\u76ee\u6807\u4e0d\u53ef\u8fbe\u3002",
    };
  }

  return {
    requiredFutureAverageGp: formatFixed(requiredGp, 3),
    feasible: true,
    infeasibleReason: null,
  };
}

function getMinimumPercentageText(requiredGp: number) {
  const directHit = SCORE_TEXT_BY_THRESHOLD.find(
    (threshold) => threshold.text !== null && requiredGp <= threshold.max,
  );
  if (directHit?.text) {
    return directHit.text;
  }
  if (requiredGp >= 4) {
    return "100 \u5206";
  }

  const gap = ((4 - requiredGp) * 1600) / 3;
  const minimumScore = 100 - Math.sqrt(gap);
  return `${formatFixed(minimumScore, 1)} \u5206`;
}

function getMinimumGradeText(requiredGp: number) {
  if (requiredGp <= 1.7) {
    return `${GRADE_POINT_LABELS.pass} (1.7)`;
  }
  if (requiredGp <= 2.8) {
    return `${GRADE_POINT_LABELS.medium} (2.8)`;
  }
  if (requiredGp <= 3.5) {
    return `${GRADE_POINT_LABELS.good} (3.5)`;
  }
  return `${GRADE_POINT_LABELS.excellent} (4.0)`;
}

function getRequiredScoreText(requiredFutureAverageGp: string | null) {
  if (requiredFutureAverageGp === null) {
    return "\u8fd8\u6ca1\u6709\u53ef\u7528\u4e8e\u89c4\u5212\u7684\u672a\u4fee\u8bfe\u7a0b\u3002";
  }

  const numeric = Number(requiredFutureAverageGp);
  if (numeric <= 0) {
    return "\u5f53\u524d GPA \u5df2\u8fbe\u6807\uff0c\u5269\u4f59\u8bfe\u7a0b\u4e0d\u518d\u9700\u8981\u63d0\u4f9b\u989d\u5916\u7ee9\u70b9\u3002";
  }

  if (numeric > 4) {
    return "\u76ee\u6807\u4e0d\u53ef\u8fbe\uff1a\u672a\u6765\u8bfe\u7a0b\u5e73\u5747\u7ee9\u70b9\u65e0\u6cd5\u8d85\u8fc7 4.0\u3002";
  }

  return `\u82e5\u6309\u767e\u5206\u5236\u4f30\u7b97\uff0c\u5269\u4f59\u8bfe\u7a0b\u5e73\u5747\u81f3\u5c11\u9700 ${getMinimumPercentageText(numeric)}\uff1b\u82e5\u6309\u7b49\u7ea7\u5236\u4f30\u7b97\uff0c\u81f3\u5c11\u9700\u8fbe\u5230 ${getMinimumGradeText(numeric)}\u3002`;
}

function recalculatePlanning(planning: PlanningTargetResult, courses: CourseRecord[]) {
  const baseline = getPlanningBaseline(courses);
  const targetGpa = Number(planning.targetGpa);
  const requirement = getRequiredFutureAverage(targetGpa, baseline);
  const plannedCourseIds = new Set(baseline.plannedCourses.map((course) => course.id));
  const plannedCourseMap = new Map(baseline.plannedCourses.map((course) => [course.id, course]));

  const scenarios = planning.scenarios.map<PlanningScenarioResult>((scenario) => {
    const expectations = scenario.expectations.filter((expectation) =>
      plannedCourseIds.has(expectation.courseId),
    );
    const coveredCourseIds = new Set(expectations.map((expectation) => expectation.courseId));
    const coveredPlannedCredit = expectations.reduce((sum, expectation) => {
      const course = plannedCourseMap.get(expectation.courseId);
      return course ? sum + Number(course.credit) : sum;
    }, 0);
    const expectedQualityPointSum = expectations.reduce((sum, expectation) => {
      const course = plannedCourseMap.get(expectation.courseId);
      return course && expectation.gradePoint
        ? sum + Number(course.credit) * Number(expectation.gradePoint)
        : sum;
    }, 0);
    const totalCredit = Number(baseline.summary.countedCreditSum) + coveredPlannedCredit;
    const simulatedFinalGpa =
      totalCredit > 0
        ? formatFixed(
            (Number(baseline.summary.qualityPointSum) + expectedQualityPointSum) / totalCredit,
            3,
          )
        : null;

    return {
      ...scenario,
      simulatedFinalGpa,
      requiredFutureAverageGp: requirement.requiredFutureAverageGp,
      coveredPlannedCredit: formatFixed(coveredPlannedCredit, 1),
      isFullCoverage: coveredCourseIds.size === baseline.plannedCourses.length,
      expectationCount: coveredCourseIds.size,
      expectations,
    };
  });

  return {
    ...planning,
    basedOnCurrentGpa: baseline.summary.currentGpa ?? "0.000",
    basedOnCompletedCreditSum: baseline.summary.countedCreditSum,
    plannedCreditSum: formatFixed(baseline.plannedCreditSum, 1),
    requiredFutureAverageGp: requirement.requiredFutureAverageGp,
    requiredScoreText: getRequiredScoreText(requirement.requiredFutureAverageGp),
    feasible: requirement.feasible,
    infeasibleReason: requirement.infeasibleReason,
    scenarios,
  };
}

function createEmptyPlanningTarget(targetGpa: string): PlanningTargetResult {
  const normalizedTarget = Number(targetGpa || "3.820");
  if (!Number.isFinite(normalizedTarget) || normalizedTarget < 0 || normalizedTarget > 4) {
    throw new Error("\u76ee\u6807 GPA \u5fc5\u987b\u5728 0 \u5230 4 \u4e4b\u95f4\u3002");
  }

  const targetId = `mock-target-${mockState.nextTargetId++}`;
  const baseline = getPlanningBaseline(mockState.courses);
  const requirement = getRequiredFutureAverage(normalizedTarget, baseline);

  return {
    targetId,
    targetGpa: formatFixed(normalizedTarget, 3),
    basedOnCurrentGpa: baseline.summary.currentGpa ?? "0.000",
    basedOnCompletedCreditSum: baseline.summary.countedCreditSum,
    plannedCreditSum: formatFixed(baseline.plannedCreditSum, 1),
    requiredFutureAverageGp: requirement.requiredFutureAverageGp,
    requiredScoreText: getRequiredScoreText(requirement.requiredFutureAverageGp),
    feasible: requirement.feasible,
    infeasibleReason: requirement.infeasibleReason,
    scenarios: (["OPTIMISTIC", "NEUTRAL", "CONSERVATIVE"] as ScenarioType[]).map(
      (scenarioType) => ({
        scenarioId: `${targetId}-${scenarioType.toLowerCase()}`,
        scenarioType,
        simulatedFinalGpa: null,
        requiredFutureAverageGp: requirement.requiredFutureAverageGp,
        coveredPlannedCredit: "0.0",
        isFullCoverage: baseline.plannedCourses.length === 0,
        expectationCount: 0,
        expectations: [],
      }),
    ),
  };
}

function refreshPlanningIfNeeded() {
  if (mockState.latestPlanning) {
    mockState.latestPlanning = recalculatePlanning(mockState.latestPlanning, mockState.courses);
  }
}

function buildSnapshot(): AppSnapshot {
  return {
    summary: calculateSummary(mockState.courses),
    courses: sortCourses(mockState.courses),
    latestPlanning: mockState.latestPlanning ? clone(mockState.latestPlanning) : null,
    importTemplates: {
      courseTextExample: [
        "course_name=Operating Systems;semester=2025\\u79cb;credit=4.0;status=PLANNED;score_type=PERCENTAGE;note=core",
        "course_name=Computer Networks;semester=2025\\u79cb;credit=3.0;status=PLANNED;score_type=PERCENTAGE",
      ].join("\n"),
      scoreTextExample: [
        "course_name=Advanced Mathematics;semester=2024\\u79cb;raw_score=92",
        "course_name=College English;semester=2024\\u79cb;raw_score=88",
      ].join("\n"),
    },
  };
}

function createCourse(payload: CourseUpsertPayload) {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("\u8bfe\u7a0b\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002");
  }

  const semester = normalizeSemester(payload.semester);
  assertSemester(semester);
  assertDuplicateCourse(name, semester);

  const nextCourse: CourseRecord = {
    id: `course-${mockState.nextCourseId++}`,
    name,
    semester,
    credit: assertCredit(payload.credit),
    status: payload.status,
    scoreType: payload.scoreType,
    note: normalizeText(payload.note),
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  };

  mockState.courses = sortCourses([...mockState.courses, nextCourse]);
  refreshPlanningIfNeeded();
  return clone(nextCourse);
}

function updateCourse(courseId: string, payload: CourseUpsertPayload) {
  const index = getCourseIndex(courseId);
  const currentCourse = mockState.courses[index];
  const name = payload.name.trim();
  if (!name) {
    throw new Error("\u8bfe\u7a0b\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002");
  }

  const semester = normalizeSemester(payload.semester);
  assertSemester(semester);
  assertDuplicateCourse(name, semester, courseId);

  if (payload.status === "PLANNED" && currentCourse.hasScore) {
    throw new Error(
      "\u5df2\u5f55\u5165\u6210\u7ee9\u7684\u8bfe\u7a0b\u4e0d\u80fd\u76f4\u63a5\u6539\u6210\u672a\u4fee\uff0c\u8bf7\u5148\u6e05\u7a7a\u6210\u7ee9\u3002",
    );
  }

  if (payload.status === "COMPLETED" && currentCourse.hasScore && payload.scoreType === null) {
    throw new Error(
      "\u5df2\u5f55\u5165\u6210\u7ee9\u7684\u8bfe\u7a0b\u5fc5\u987b\u4fdd\u7559\u6210\u7ee9\u7c7b\u578b\u3002",
    );
  }

  const nextCourse: CourseRecord = {
    ...currentCourse,
    name,
    semester,
    credit: assertCredit(payload.credit),
    status: payload.status,
    scoreType: payload.scoreType,
    note: normalizeText(payload.note),
    hasScore: payload.status === "COMPLETED" ? currentCourse.hasScore : false,
    rawScore: payload.status === "COMPLETED" ? currentCourse.rawScore : null,
    gradePoint: payload.status === "COMPLETED" ? currentCourse.gradePoint : null,
  };

  if (nextCourse.status === "COMPLETED" && nextCourse.hasScore && nextCourse.rawScore && nextCourse.scoreType) {
    nextCourse.gradePoint = convertToGradePoint(nextCourse.scoreType, nextCourse.rawScore);
  }

  mockState.courses[index] = nextCourse;
  mockState.courses = sortCourses(mockState.courses);
  refreshPlanningIfNeeded();
  return clone(nextCourse);
}

function deleteCourse(courseId: string): CourseDeleteResult {
  getCourseIndex(courseId);
  mockState.courses = mockState.courses.filter((course) => course.id !== courseId);
  refreshPlanningIfNeeded();
  return {
    deleted: true,
    courseId,
  };
}

function recordScore(payload: ScoreUpsertPayload) {
  const index = getCourseIndex(payload.courseId);
  const currentCourse = mockState.courses[index];
  if (currentCourse.status !== "COMPLETED") {
    throw new Error("\u672a\u4fee\u8bfe\u7a0b\u4e0d\u80fd\u5f55\u5165\u771f\u5b9e\u6210\u7ee9\u3002");
  }

  const resolvedScoreType = payload.scoreType ?? currentCourse.scoreType;
  if (resolvedScoreType === null) {
    throw new Error("\u5f55\u5165\u6210\u7ee9\u524d\u5fc5\u987b\u5148\u8bbe\u5b9a\u6210\u7ee9\u7c7b\u578b\u3002");
  }

  const normalizedScore = payload.rawScore.trim();
  const updatedCourse: CourseRecord = {
    ...currentCourse,
    scoreType: resolvedScoreType,
    hasScore: true,
    rawScore: normalizedScore,
    gradePoint: convertToGradePoint(resolvedScoreType, normalizedScore),
  };

  mockState.courses[index] = updatedCourse;
  refreshPlanningIfNeeded();
  return clone(updatedCourse);
}

function clearScore(courseId: string) {
  const index = getCourseIndex(courseId);
  const currentCourse = mockState.courses[index];
  if (currentCourse.status !== "COMPLETED") {
    throw new Error("\u672a\u4fee\u8bfe\u7a0b\u6ca1\u6709\u53ef\u6e05\u7a7a\u7684\u6210\u7ee9\u3002");
  }

  const updatedCourse: CourseRecord = {
    ...currentCourse,
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  };

  mockState.courses[index] = updatedCourse;
  refreshPlanningIfNeeded();
  return clone(updatedCourse);
}

function createPlanningTarget(targetGpa: string) {
  mockState.latestPlanning = createEmptyPlanningTarget(targetGpa);
  mockState.latestPlanning = recalculatePlanning(mockState.latestPlanning, mockState.courses);
  return clone(mockState.latestPlanning);
}

function savePlanningExpectations(payload: PlanningExpectationSavePayload) {
  if (mockState.latestPlanning === null || mockState.latestPlanning.targetId !== payload.targetId) {
    throw new Error("\u89c4\u5212\u76ee\u6807\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u521b\u5efa\u76ee\u6807 GPA\u3002");
  }

  const scenarioMap = new Map(
    mockState.latestPlanning.scenarios.map((scenario) => [scenario.scenarioId, scenario]),
  );

  for (const expectation of payload.expectations) {
    const scenario = scenarioMap.get(expectation.scenarioId);
    if (!scenario) {
      throw new Error("\u89c4\u5212\u60c5\u666f\u4e0d\u5b58\u5728\u3002");
    }

    const course = getCourse(expectation.courseId);
    if (course.status !== "PLANNED") {
      throw new Error("\u53ea\u80fd\u4e3a\u672a\u4fee\u8bfe\u7a0b\u4fdd\u5b58\u9884\u671f\u6210\u7ee9\u3002");
    }

    scenario.expectations = scenario.expectations.filter(
      (item) => item.courseId !== expectation.courseId,
    );

    if (expectation.rawScore === null || !expectation.rawScore.trim()) {
      continue;
    }

    const resolvedScoreType = expectation.scoreType ?? course.scoreType;
    if (resolvedScoreType === null) {
      throw new Error(
        `\u8bfe\u7a0b ${course.name} \u8fd8\u6ca1\u6709\u8bbe\u5b9a\u6210\u7ee9\u7c7b\u578b\uff0c\u8bf7\u5148\u5728\u8bfe\u7a0b\u7ba1\u7406\u9875\u5b8c\u6210\u8bbe\u7f6e\u3002`,
      );
    }

    const nextExpectation: PlanningScenarioExpectation = {
      courseId: expectation.courseId,
      rawScore: expectation.rawScore.trim(),
      gradePoint: convertToGradePoint(resolvedScoreType, expectation.rawScore),
    };
    scenario.expectations = [...scenario.expectations, nextExpectation];
  }

  mockState.latestPlanning = recalculatePlanning(mockState.latestPlanning, mockState.courses);
  return clone(mockState.latestPlanning);
}

function buildMockImportResult(kind: ImportKind, text: string, applied: boolean): ImportWorkbenchResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const errors = lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => !line.includes("="))
    .map(({ line, lineNumber }) => ({
      lineNumber,
      identifier: line,
      message: "Malformed segment. Each field must use key=value.",
    }));
  const errorCount = errors.length;
  const importedIdentifiers = applied && errorCount === 0 ? lines.slice(0, 5) : [];

  return {
    kind,
    parsedCount: lines.length,
    validCount: Math.max(lines.length - errorCount, 0),
    successCount: importedIdentifiers.length,
    skippedCount: 0,
    failureCount: errorCount,
    errorCount,
    applied: applied && errorCount === 0,
    importedIdentifiers,
    skipped: [],
    errors,
  };
}

const seedCourses: CourseRecord[] = [
  {
    id: "course-1",
    name: "Advanced Mathematics",
    semester: "2024\u79cb",
    credit: "4.0",
    status: "COMPLETED",
    scoreType: "PERCENTAGE",
    note: "\u6838\u5fc3\u57fa\u7840\u8bfe",
    hasScore: true,
    rawScore: "92",
    gradePoint: convertToGradePoint("PERCENTAGE", "92"),
  },
  {
    id: "course-2",
    name: "College English",
    semester: "2024\u79cb",
    credit: "2.0",
    status: "COMPLETED",
    scoreType: "PERCENTAGE",
    note: null,
    hasScore: true,
    rawScore: "88",
    gradePoint: convertToGradePoint("PERCENTAGE", "88"),
  },
  {
    id: "course-3",
    name: "Data Structures",
    semester: "2025\u6625",
    credit: "3.5",
    status: "COMPLETED",
    scoreType: "PERCENTAGE",
    note: "\u4e13\u4e1a\u6838\u5fc3",
    hasScore: true,
    rawScore: "90",
    gradePoint: convertToGradePoint("PERCENTAGE", "90"),
  },
  {
    id: "course-4",
    name: "Discrete Mathematics",
    semester: "2025\u6625",
    credit: "3.0",
    status: "COMPLETED",
    scoreType: "PERCENTAGE",
    note: null,
    hasScore: true,
    rawScore: "87",
    gradePoint: convertToGradePoint("PERCENTAGE", "87"),
  },
  {
    id: "course-5",
    name: "Innovation Practice",
    semester: "2025\u6625",
    credit: "2.0",
    status: "COMPLETED",
    scoreType: "GRADE",
    note: "\u7b49\u7ea7\u5236\u8bfe\u7a0b",
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  },
  {
    id: "course-6",
    name: "Operating Systems",
    semester: "2025\u79cb",
    credit: "4.0",
    status: "PLANNED",
    scoreType: "PERCENTAGE",
    note: "\u9ad8\u6743\u91cd\u63d0\u5206\u7a7a\u95f4",
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  },
  {
    id: "course-7",
    name: "Computer Networks",
    semester: "2025\u79cb",
    credit: "3.0",
    status: "PLANNED",
    scoreType: "PERCENTAGE",
    note: null,
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  },
  {
    id: "course-8",
    name: "Database Systems",
    semester: "2026\u6625",
    credit: "3.5",
    status: "PLANNED",
    scoreType: "PERCENTAGE",
    note: "\u4e0e\u6861\u9762\u9879\u76ee\u8054\u52a8",
    hasScore: false,
    rawScore: null,
    gradePoint: null,
  },
];

const mockState: MockState = {
  courses: sortCourses(seedCourses),
  latestPlanning: null,
  nextCourseId: 9,
  nextTargetId: 1,
};

mockState.latestPlanning = createEmptyPlanningTarget("3.820");
mockState.latestPlanning = savePlanningExpectations({
  targetId: mockState.latestPlanning.targetId,
  expectations: [
    {
      scenarioId: mockState.latestPlanning.scenarios[0].scenarioId,
      courseId: "course-6",
      rawScore: "95",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[0].scenarioId,
      courseId: "course-7",
      rawScore: "94",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[0].scenarioId,
      courseId: "course-8",
      rawScore: "96",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[1].scenarioId,
      courseId: "course-6",
      rawScore: "92",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[1].scenarioId,
      courseId: "course-7",
      rawScore: "90",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[1].scenarioId,
      courseId: "course-8",
      rawScore: "91",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[2].scenarioId,
      courseId: "course-6",
      rawScore: "88",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[2].scenarioId,
      courseId: "course-7",
      rawScore: "86",
      scoreType: "PERCENTAGE",
    },
    {
      scenarioId: mockState.latestPlanning.scenarios[2].scenarioId,
      courseId: "course-8",
      rawScore: "84",
      scoreType: "PERCENTAGE",
    },
  ],
});

export const mockDesktopApi = {
  getSnapshot(): AppSnapshot {
    return buildSnapshot();
  },
  createCourse(payload: CourseUpsertPayload) {
    return createCourse(payload);
  },
  updateCourse(courseId: string, payload: CourseUpsertPayload) {
    return updateCourse(courseId, payload);
  },
  deleteCourse(courseId: string) {
    return deleteCourse(courseId);
  },
  recordScore(payload: ScoreUpsertPayload) {
    return recordScore(payload);
  },
  clearScore(courseId: string) {
    return clearScore(courseId);
  },
  createPlanningTarget(targetGpa: string) {
    return createPlanningTarget(targetGpa);
  },
  savePlanningExpectations(payload: PlanningExpectationSavePayload) {
    return savePlanningExpectations(payload);
  },
  runImport(kind: ImportKind, text: string, apply: boolean) {
    return buildMockImportResult(kind, text, apply);
  },
};
