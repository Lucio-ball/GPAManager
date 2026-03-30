import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppFeedback } from "@/components/shared/feedback-center";
import { desktopApi } from "@/services/backend";
import type {
  AppInfo,
  CourseUpsertPayload,
  DataBackupResult,
  DataExportResult,
  DataRestoreResult,
  ImportKind,
  OperationLogRecord,
  PlanningExpectationSavePayload,
  ScoreUpsertPayload,
  StartupHealthReport,
} from "@/types/domain";

const queryKeys = {
  appInfo: ["app-info"] as const,
  startupHealth: ["startup-health"] as const,
  operationLogs: ["operation-logs"] as const,
  backups: ["database-backups"] as const,
  snapshot: ["snapshot"] as const,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
}

export function useSnapshotQuery() {
  return useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: () => desktopApi.getSnapshot(),
  });
}

export function useAppInfoQuery() {
  return useQuery<AppInfo>({
    queryKey: queryKeys.appInfo,
    queryFn: () => desktopApi.getAppInfo(),
    staleTime: Infinity,
  });
}

export function useStartupHealthQuery() {
  return useQuery<StartupHealthReport>({
    queryKey: queryKeys.startupHealth,
    queryFn: () => desktopApi.getStartupHealth(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useRecentOperationLogsQuery(limit = 12, enabled = true) {
  return useQuery<OperationLogRecord[]>({
    queryKey: [...queryKeys.operationLogs, limit],
    queryFn: () => desktopApi.getRecentOperationLogs(limit),
    enabled,
    staleTime: 5_000,
  });
}

export function useBackupCatalogQuery(limit = 12, enabled = true) {
  return useQuery<DataBackupResult[]>({
    queryKey: [...queryKeys.backups, limit],
    queryFn: () => desktopApi.listDatabaseBackups(limit),
    enabled,
    staleTime: 5_000,
  });
}

async function invalidateSnapshotAndLogs(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.snapshot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs }),
  ]);
}

async function invalidateBackupAndLogs(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.backups }),
    queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs }),
  ]);
}

async function invalidateRuntimeState(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.snapshot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.appInfo }),
    queryClient.invalidateQueries({ queryKey: queryKeys.startupHealth }),
    queryClient.invalidateQueries({ queryKey: queryKeys.backups }),
    queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs }),
  ]);
}

export function useCreateCourseMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (payload: CourseUpsertPayload) => desktopApi.createCourse(payload),
    onSuccess: async () => {
      feedback.success("\u8bfe\u7a0b\u5df2\u521b\u5efa", "\u8bfe\u7a0b\u5217\u8868\u548c GPA \u5feb\u7167\u5df2\u540c\u6b65\u5237\u65b0\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u65b0\u5efa\u8bfe\u7a0b\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useUpdateCourseMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: ({ courseId, payload }: { courseId: string; payload: CourseUpsertPayload }) =>
      desktopApi.updateCourse(courseId, payload),
    onSuccess: async () => {
      feedback.success("\u8bfe\u7a0b\u5df2\u4fdd\u5b58", "\u8bfe\u7a0b\u53d8\u66f4\u5df2\u540c\u6b65\u5230\u9996\u9875\u5feb\u7167\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u7f16\u8f91\u8bfe\u7a0b\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useDeleteCourseMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (courseId: string) => desktopApi.deleteCourse(courseId),
    onSuccess: async () => {
      feedback.success("\u8bfe\u7a0b\u5df2\u5220\u9664", "\u76f8\u5173\u6210\u7ee9\u4e0e\u89c4\u5212\u8ba1\u7b97\u5df2\u91cd\u65b0\u5237\u65b0\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u5220\u9664\u8bfe\u7a0b\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useBatchUpdateCoursesMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: async ({
      updates,
    }: {
      updates: Array<{ courseId: string; payload: CourseUpsertPayload; label: string }>;
    }) => {
      const settled = await Promise.allSettled(
        updates.map(async (item) => ({
          label: item.label,
          course: await desktopApi.updateCourse(item.courseId, item.payload),
        })),
      );

      const succeeded = settled.flatMap((item) =>
        item.status === "fulfilled" ? [item.value] : [],
      );
      const failed = settled.flatMap((item) =>
        item.status === "rejected"
          ? [item.reason instanceof Error ? item.reason.message : "批量更新失败。"]
          : [],
      );

      return {
        successCount: succeeded.length,
        failureCount: failed.length,
        failedMessages: failed,
      };
    },
    onSuccess: async (result) => {
      if (!result.successCount && result.failureCount) {
        feedback.error("批量修改失败", result.failedMessages[0] ?? "未能完成批量更新。");
        await queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
        return;
      }

      const description = result.failureCount
        ? `已更新 ${result.successCount} 门课程，另有 ${result.failureCount} 门未更新。`
        : `已更新 ${result.successCount} 门课程。`;
      feedback.success("批量修改已完成", description);
      await invalidateSnapshotAndLogs(queryClient);
      if (result.failureCount) {
        feedback.error("部分课程未更新", result.failedMessages[0] ?? "请检查课程状态或已录入成绩约束。");
      }
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("批量修改失败", getErrorMessage(error));
    },
  });
}

export function useRecordScoreMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (payload: ScoreUpsertPayload) => desktopApi.recordScore(payload),
    onSuccess: async () => {
      feedback.success("\u6210\u7ee9\u5df2\u4fdd\u5b58", "GPA \u5df2\u6839\u636e\u6700\u65b0\u6210\u7ee9\u91cd\u65b0\u8ba1\u7b97\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u4fdd\u5b58\u6210\u7ee9\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useClearScoreMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (courseId: string) => desktopApi.clearScore(courseId),
    onSuccess: async () => {
      feedback.success("\u6210\u7ee9\u5df2\u6e05\u7a7a", "GPA \u548c\u89c4\u5212\u57fa\u7ebf\u5df2\u540c\u6b65\u56de\u6eda\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u6e05\u7a7a\u6210\u7ee9\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useCreatePlanningTargetMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (targetGpa: string) => desktopApi.createPlanningTarget(targetGpa),
    onSuccess: async () => {
      feedback.success("\u76ee\u6807 GPA \u5df2\u521b\u5efa", "\u89c4\u5212\u57fa\u7ebf\u548c\u4e09\u60c5\u666f\u5361\u7247\u5df2\u5237\u65b0\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u521b\u5efa\u76ee\u6807 GPA \u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useSavePlanningExpectationsMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (payload: PlanningExpectationSavePayload) =>
      desktopApi.savePlanningExpectations(payload),
    onSuccess: async () => {
      feedback.success("\u9884\u671f\u6210\u7ee9\u5df2\u4fdd\u5b58", "\u4e09\u60c5\u666f\u7ed3\u679c\u5df2\u91cd\u65b0\u8ba1\u7b97\u3002");
      await invalidateSnapshotAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u4fdd\u5b58\u89c4\u5212\u9884\u671f\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useImportMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: ({
      kind,
      text,
      apply,
      confirmed = false,
    }: {
      kind: ImportKind;
      text: string;
      apply: boolean;
      confirmed?: boolean;
    }) => desktopApi.runImport(kind, text, apply, confirmed),
    onSuccess: async (result, variables) => {
      if (variables.apply && result.applied) {
        feedback.success(
          "\u5bfc\u5165\u5df2\u5b8c\u6210",
          `\u5df2\u6210\u529f\u5bfc\u5165 ${result.successCount} \u6761\u8bb0\u5f55\u3002`,
        );
        await invalidateSnapshotAndLogs(queryClient);
      }
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("\u5bfc\u5165\u6267\u884c\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useCreateBackupMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation<DataBackupResult, Error, { label?: string }>({
    mutationFn: ({ label }) => desktopApi.createDatabaseBackup(label),
    onSuccess: async (result) => {
      feedback.success("数据库备份已创建", `已保存到 ${result.path}`);
      await invalidateBackupAndLogs(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("创建数据库备份失败", getErrorMessage(error));
    },
  });
}

export function useExportSnapshotMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation<DataExportResult, Error, { label?: string }>({
    mutationFn: ({ label }) => desktopApi.exportSnapshot(label),
    onSuccess: async (result) => {
      feedback.success("数据导出已生成", `已导出 ${result.recordCount} 条课程记录到 ${result.path}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("导出数据失败", getErrorMessage(error));
    },
  });
}

export function useRestoreBackupMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation<DataRestoreResult, Error, { backupPath: string }>({
    mutationFn: ({ backupPath }) => desktopApi.restoreDatabaseBackup(backupPath),
    onSuccess: async (result) => {
      feedback.success(
        "数据库已恢复",
        `已从 ${result.restoredFrom} 恢复，并自动保留恢复前安全备份 ${result.safeguardBackupPath}`,
      );
      await invalidateRuntimeState(queryClient);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs });
      feedback.error("恢复数据库备份失败", getErrorMessage(error));
    },
  });
}
