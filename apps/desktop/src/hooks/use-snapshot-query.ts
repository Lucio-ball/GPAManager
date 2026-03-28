import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppFeedback } from "@/components/shared/feedback-center";
import { desktopApi } from "@/services/backend";
import type {
  CourseUpsertPayload,
  ImportKind,
  PlanningExpectationSavePayload,
  ScoreUpsertPayload,
} from "@/types/domain";

const queryKeys = {
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

export function useCreateCourseMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: (payload: CourseUpsertPayload) => desktopApi.createCourse(payload),
    onSuccess: async () => {
      feedback.success("\u8bfe\u7a0b\u5df2\u521b\u5efa", "\u8bfe\u7a0b\u5217\u8868\u548c GPA \u5feb\u7167\u5df2\u540c\u6b65\u5237\u65b0\u3002");
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
      feedback.error("\u5220\u9664\u8bfe\u7a0b\u5931\u8d25", getErrorMessage(error));
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
    onError: (error) => {
      feedback.error("\u4fdd\u5b58\u89c4\u5212\u9884\u671f\u5931\u8d25", getErrorMessage(error));
    },
  });
}

export function useImportMutation() {
  const queryClient = useQueryClient();
  const feedback = useAppFeedback();

  return useMutation({
    mutationFn: ({ kind, text, apply }: { kind: ImportKind; text: string; apply: boolean }) =>
      desktopApi.runImport(kind, text, apply),
    onSuccess: async (result, variables) => {
      if (variables.apply && result.applied) {
        feedback.success(
          "\u5bfc\u5165\u5df2\u5b8c\u6210",
          `\u5df2\u6210\u529f\u5bfc\u5165 ${result.successCount} \u6761\u8bb0\u5f55\u3002`,
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      }
    },
    onError: (error) => {
      feedback.error("\u5bfc\u5165\u6267\u884c\u5931\u8d25", getErrorMessage(error));
    },
  });
}
