export type CourseStatus = "COMPLETED" | "PLANNED";
export type ScoreType = "PERCENTAGE" | "GRADE";
export type ScenarioType = "OPTIMISTIC" | "NEUTRAL" | "CONSERVATIVE";
export type ImportKind = "COURSE" | "SCORE";

export type AppInfo = {
  databasePath: string;
  dataDirectory: string;
  backupDirectory: string;
  exportDirectory: string;
};

export type DataBackupResult = {
  path: string;
  fileName: string;
  createdAt: string;
  sizeBytes: number;
};

export type DataExportResult = {
  path: string;
  fileName: string;
  createdAt: string;
  recordCount: number;
  sizeBytes: number;
};

export type CourseUpsertPayload = {
  name: string;
  semester: string;
  credit: string;
  status: CourseStatus;
  scoreType: ScoreType | null;
  note: string | null;
};

export type ScoreUpsertPayload = {
  courseId: string;
  rawScore: string;
  scoreType: ScoreType | null;
};

export type CourseRecord = {
  id: string;
  name: string;
  semester: string;
  credit: string;
  status: CourseStatus;
  scoreType: ScoreType | null;
  note: string | null;
  hasScore: boolean;
  rawScore: string | null;
  gradePoint: string | null;
};

export type GpaSummary = {
  currentGpa: string | null;
  countedCreditSum: string;
  countedCourseCount: number;
  qualityPointSum: string;
};

export type PlanningScenarioExpectation = {
  courseId: string;
  rawScore: string;
  gradePoint: string | null;
};

export type PlanningScenarioResult = {
  scenarioId: string;
  scenarioType: ScenarioType;
  simulatedFinalGpa: string | null;
  requiredFutureAverageGp: string | null;
  coveredPlannedCredit: string;
  isFullCoverage: boolean;
  expectationCount: number;
  expectations: PlanningScenarioExpectation[];
};

export type PlanningTargetResult = {
  targetId: string;
  targetGpa: string;
  basedOnCurrentGpa: string;
  basedOnCompletedCreditSum: string;
  plannedCreditSum: string;
  requiredFutureAverageGp: string | null;
  requiredScoreText: string;
  feasible: boolean | null;
  infeasibleReason: string | null;
  scenarios: PlanningScenarioResult[];
};

export type PlanningExpectationPayload = {
  scenarioId: string;
  courseId: string;
  rawScore: string | null;
  scoreType: ScoreType | null;
};

export type PlanningExpectationSavePayload = {
  targetId: string;
  expectations: PlanningExpectationPayload[];
};

export type CourseDeleteResult = {
  deleted: boolean;
  courseId: string;
};

export type ImportDetail = {
  lineNumber: number;
  identifier: string;
  message: string;
};

export type ImportSkippedDetail = {
  lineNumber: number;
  identifier: string;
  reason: string;
};

export type ImportWorkbenchResult = {
  kind: ImportKind;
  parsedCount: number;
  validCount: number;
  successCount: number;
  skippedCount: number;
  failureCount: number;
  errorCount: number;
  applied: boolean;
  importedIdentifiers: string[];
  errors: ImportDetail[];
  skipped: ImportSkippedDetail[];
};

export type AppSnapshot = {
  summary: GpaSummary;
  courses: CourseRecord[];
  latestPlanning: PlanningTargetResult | null;
  importTemplates: {
    courseTextExample: string;
    scoreTextExample: string;
  };
};
