import { mockDesktopApi } from "@/data/mock-gpa-data";
import { invokeBridge } from "@/services/bridge";
import type {
  AppSnapshot,
  CourseDeleteResult,
  CourseRecord,
  CourseUpsertPayload,
  ImportKind,
  ImportWorkbenchResult,
  PlanningExpectationSavePayload,
  PlanningTargetResult,
  ScoreUpsertPayload,
} from "@/types/domain";

export const desktopApi = {
  async getSnapshot(): Promise<AppSnapshot> {
    return invokeBridge<AppSnapshot>("snapshot", undefined, () => mockDesktopApi.getSnapshot());
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

  async runImport(kind: ImportKind, text: string, apply: boolean): Promise<ImportWorkbenchResult> {
    return invokeBridge<ImportWorkbenchResult>(
      "import.run",
      { kind, text, apply },
      () => mockDesktopApi.runImport(kind, text, apply),
    );
  },
};
