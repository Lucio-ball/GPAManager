import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopApi } from "@/services/backend";
import type { ImportKind } from "@/types/domain";

export function useSnapshotQuery() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => desktopApi.getSnapshot(),
  });
}

export function useCreatePlanningTargetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetGpa: string) => desktopApi.createPlanningTarget(targetGpa),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    },
  });
}

export function useImportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ kind, text, apply }: { kind: ImportKind; text: string; apply: boolean }) =>
      desktopApi.runImport(kind, text, apply),
    onSuccess: async (result, variables) => {
      if (variables.apply && result.applied) {
        await queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      }
    },
  });
}
