import { mockDesktopApi } from "@/data/mock-gpa-data";
import { invokeBridge } from "@/services/bridge";
import type {
  AppInfo,
  AppSnapshot,
  CourseDeleteResult,
  CourseRecord,
  CourseUpsertPayload,
  DataBackupResult,
  DataExportResult,
  ImportKind,
  ImportWorkbenchResult,
  PlanningExpectationSavePayload,
  PlanningTargetResult,
  ScoreUpsertPayload,
} from "@/types/domain";

export const desktopApi = {
  async getAppInfo(): Promise<AppInfo> {
    return invokeBridge<AppInfo>("app.info", undefined, () => mockDesktopApi.getAppInfo());
  },

  async getSnapshot(): Promise<AppSnapshot> {
    return invokeBridge<AppSnapshot>("snapshot", undefined, () => mockDesktopApi.getSnapshot());
  },

  async createDatabaseBackup(label?: string): Promise<DataBackupResult> {
    return invokeBridge<DataBackupResult>(
      "data.backup",
      { label },
      () => mockDesktopApi.createDatabaseBackup(label),
    );
  },

  async exportSnapshot(label?: string): Promise<DataExportResult> {
    return invokeBridge<DataExportResult>(
      "data.export",
      { label },
      () => mockDesktopApi.exportSnapshot(label),
    );
  },

  async createCourse(payload: CourseUpsertPayload): Promise<CourseRecord> {
    return invokeBridge<CourseRecord>("course.create", payload, () => mockDesktopApi.createCourse(payload));
  },

  async updateCourse(courseId: string, payload: CourseUpsertPayload): Promise<CourseRecord> {
    return invokeBridge<CourseRecord>(
      "course.update",
      { courseId, ...payload },
      () => mockDesktopApi.updateCourse(courseId, payload),
    );
  },

  async deleteCourse(courseId: string): Promise<CourseDeleteResult> {
    return invokeBridge<CourseDeleteResult>(
      "course.delete",
      { courseId },
      () => mockDesktopApi.deleteCourse(courseId),
    );
  },

  async recordScore(payload: ScoreUpsertPayload): Promise<CourseRecord> {
    return invokeBridge<CourseRecord>("score.record", payload, () => mockDesktopApi.recordScore(payload));
  },

  async clearScore(courseId: string): Promise<CourseRecord> {
    return invokeBridge<CourseRecord>("score.clear", { courseId }, () => mockDesktopApi.clearScore(courseId));
  },

  async createPlanningTarget(targetGpa: string): Promise<PlanningTargetResult> {
    return invokeBridge<PlanningTargetResult>(
      "planning.create_target",
      { targetGpa },
      () => mockDesktopApi.createPlanningTarget(targetGpa),
    );
  },

  async savePlanningExpectations(
    payload: PlanningExpectationSavePayload,
  ): Promise<PlanningTargetResult> {
    return invokeBridge<PlanningTargetResult>(
      "planning.save_expectations",
      payload,
      () => mockDesktopApi.savePlanningExpectations(payload),
    );
  },

  async runImport(
    kind: ImportKind,
    text: string,
    apply: boolean,
    confirmed = false,
  ): Promise<ImportWorkbenchResult> {
    return invokeBridge<ImportWorkbenchResult>(
      "import.run",
      { kind, text, apply, confirmed },
      () => mockDesktopApi.runImport(kind, text, apply, confirmed),
    );
  },
};
