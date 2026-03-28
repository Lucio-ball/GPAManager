import { buildMockImportResult, buildMockPlanningTarget, mockSnapshot } from "@/data/mock-gpa-data";
import { invokeBridge } from "@/services/bridge";
import type { AppSnapshot, ImportKind, ImportWorkbenchResult, PlanningTargetResult } from "@/types/domain";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const desktopApi = {
  async getSnapshot(): Promise<AppSnapshot> {
    return invokeBridge<AppSnapshot>("snapshot", undefined, () => deepClone(mockSnapshot));
  },

  async createPlanningTarget(targetGpa: string): Promise<PlanningTargetResult> {
    return invokeBridge<PlanningTargetResult>(
      "planning.create_target",
      { targetGpa },
      () => buildMockPlanningTarget(targetGpa),
    );
  },

  async runImport(kind: ImportKind, text: string, apply: boolean): Promise<ImportWorkbenchResult> {
    return invokeBridge<ImportWorkbenchResult>(
      "import.run",
      { kind, text, apply },
      () => buildMockImportResult(kind, text, apply),
    );
  },
};
