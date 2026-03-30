import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Calculator,
  Clock3,
  History,
  RefreshCw,
  RotateCcw,
  Save,
  Target,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AsyncButton } from "@/components/shared/async-button";
import { PageHero } from "@/components/shared/page-hero";
import { InlineMessage } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import {
  useCreatePlanningTargetMutation,
  useSavePlanningExpectationsMutation,
  useSnapshotQuery,
} from "@/hooks/use-snapshot-query";
import { useUnsavedChangesProtection } from "@/hooks/use-unsaved-changes-protection";
import { formatCredit, formatDateTime, formatDecimal, formatScenarioLabel } from "@/lib/format";
import { gradeScoreOptions } from "@/lib/score";
import type { CourseRecord, PlanningExpectationSavePayload, PlanningTargetResult } from "@/types/domain";

type PlanningDraftState = {
  targetId: string | null;
  targetGpa: string;
  drafts: Record<string, string>;
};

const PLANNING_DRAFT_STORAGE_KEY = "gpa-manager.desktop.planning-draft.v1";

function makeDraftKey(scenarioId: string, courseId: string) {
  return `${scenarioId}:${courseId}`;
}

function buildExpectationDrafts(planning: PlanningTargetResult | null) {
  const nextDrafts: Record<string, string> = {};
  for (const scenario of planning?.scenarios ?? []) {
    for (const expectation of scenario.expectations) {
      nextDrafts[makeDraftKey(scenario.scenarioId, expectation.courseId)] = expectation.rawScore;
    }
  }
  return nextDrafts;
}

function normalizeDraftValue(value: string | null | undefined) {
  return (value ?? "").trim();
}

function validateTargetGpa(targetGpa: string) {
  const numeric = Number(targetGpa);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 4) {
    return "目标 GPA 必须是 0 到 4 之间的数字。";
  }
  return null;
}

export function PlanningPage() {
  const [searchParams] = useSearchParams();
  const { data, isFetching, refetch } = useSnapshotQuery();
  const createPlanningTargetMutation = useCreatePlanningTargetMutation();
  const savePlanningExpectationsMutation = useSavePlanningExpectationsMutation();
  const [storedPlanningDraft, setStoredPlanningDraft, clearStoredPlanningDraft] =
    useLocalStorageState<PlanningDraftState | null>(PLANNING_DRAFT_STORAGE_KEY, null);
  const savedPlanningRef = useRef<HTMLDivElement | null>(null);
  const lastHydratedPlanningKeyRef = useRef<string | null>(null);

  const courses = data?.courses ?? [];
  const plannedCourses = courses.filter((course) => course.status === "PLANNED");
  const planning = data?.latestPlanning ?? null;
  const planningScenarios = planning?.scenarios ?? [];
  const savedDrafts = useMemo(() => buildExpectationDrafts(planning), [planning]);
  const partialScenarios = useMemo(
    () => planning?.scenarios.filter((scenario) => !scenario.isFullCoverage) ?? [],
    [planning],
  );
  const planningFeasibilityLabel =
    planning?.feasible === null ? "待计算" : planning?.feasible ? "可达成" : "不可达";

  const [targetGpa, setTargetGpa] = useState("3.820");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dirtySummary = useMemo(() => {
    if (!planning) {
      return {
        changedExpectationCount: 0,
        changedScenarioCount: 0,
      };
    }

    let changedExpectationCount = 0;
    const changedScenarioIds = new Set<string>();

    for (const scenario of planning.scenarios) {
      for (const course of plannedCourses) {
        const key = makeDraftKey(scenario.scenarioId, course.id);
        const currentValue = normalizeDraftValue(drafts[key]);
        const savedValue = normalizeDraftValue(savedDrafts[key]);
        if (currentValue !== savedValue) {
          changedExpectationCount += 1;
          changedScenarioIds.add(scenario.scenarioId);
        }
      }
    }

    return {
      changedExpectationCount,
      changedScenarioCount: changedScenarioIds.size,
    };
  }, [drafts, plannedCourses, planning, savedDrafts]);

  const isTargetDirty = planning ? normalizeDraftValue(targetGpa) !== planning.targetGpa : false;
  const hasUnsavedChanges = isTargetDirty || dirtySummary.changedExpectationCount > 0;
  const { confirmDiscardChanges } = useUnsavedChangesProtection(
    hasUnsavedChanges,
    "当前规划还有未保存草稿，离开后会丢失。确定继续吗？",
  );
  const planningKey = planning ? `${planning.targetId}:${planning.lastUpdatedAt}` : "empty";
  const focusSavedPlanning = searchParams.get("focus") === "saved";

  useEffect(() => {
    const previousKey = lastHydratedPlanningKeyRef.current;
    if (previousKey === planningKey) {
      return;
    }

    const previousTargetId = previousKey?.split(":")[0] ?? null;
    const currentTargetId = planning?.targetId ?? null;
    const shouldHydrate = previousKey === null || previousTargetId !== currentTargetId || !hasUnsavedChanges;
    const hasStoredDraft =
      storedPlanningDraft &&
      storedPlanningDraft.targetId === currentTargetId &&
      (normalizeDraftValue(storedPlanningDraft.targetGpa) ||
        Object.keys(storedPlanningDraft.drafts).length > 0);

    if (!planning) {
      if (storedPlanningDraft && storedPlanningDraft.targetId === null) {
        setTargetGpa(storedPlanningDraft.targetGpa);
        setDrafts(storedPlanningDraft.drafts);
        setFormError(null);
        lastHydratedPlanningKeyRef.current = planningKey;
        return;
      }

      if (shouldHydrate) {
        setTargetGpa("3.820");
        setDrafts({});
        setFormError(null);
      }
      lastHydratedPlanningKeyRef.current = planningKey;
      return;
    }

    if (hasStoredDraft) {
      setTargetGpa(storedPlanningDraft.targetGpa);
      setDrafts(storedPlanningDraft.drafts);
      setFormError(null);
      lastHydratedPlanningKeyRef.current = planningKey;
      return;
    }

    if (shouldHydrate) {
      setTargetGpa(planning.targetGpa);
      setDrafts(buildExpectationDrafts(planning));
      setFormError(null);
      lastHydratedPlanningKeyRef.current = planningKey;
    }
  }, [hasUnsavedChanges, planning, planningKey, storedPlanningDraft]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      setStoredPlanningDraft({
        targetId: planning?.targetId ?? null,
        targetGpa,
        drafts,
      });
      return;
    }

    clearStoredPlanningDraft();
  }, [
    clearStoredPlanningDraft,
    drafts,
    hasUnsavedChanges,
    planning?.targetId,
    setStoredPlanningDraft,
    targetGpa,
  ]);

  useEffect(() => {
    if (!focusSavedPlanning || !planning || !savedPlanningRef.current) {
      return;
    }

    savedPlanningRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [focusSavedPlanning, planning]);

  const handleCreateTarget = () => {
    const validationError = validateTargetGpa(targetGpa);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    createPlanningTargetMutation.mutate(targetGpa, {
      onSuccess: (result) => {
        setTargetGpa(result.targetGpa);
        setDrafts(buildExpectationDrafts(result));
        clearStoredPlanningDraft();
        lastHydratedPlanningKeyRef.current = `${result.targetId}:${result.lastUpdatedAt}`;
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "创建目标 GPA 失败。");
      },
    });
  };

  const handleSaveExpectations = () => {
    if (!planning) {
      setFormError("请先创建目标 GPA，再保存未修课程预期成绩。");
      return;
    }

    const coursesMissingScoreType = plannedCourses.filter((course) => {
      if (course.scoreType !== null) {
        return false;
      }
      return planning.scenarios.some((scenario) => {
        const value = drafts[makeDraftKey(scenario.scenarioId, course.id)] ?? "";
        return value.trim().length > 0;
      });
    });

    if (coursesMissingScoreType.length) {
      setFormError(
        `以下课程还未设置成绩类型：${coursesMissingScoreType.map((course) => course.name).join("、")}。请先去课程页补齐。`,
      );
      return;
    }

    setFormError(null);

    const payload: PlanningExpectationSavePayload = {
      targetId: planning.targetId,
      expectations: planning.scenarios.flatMap((scenario) =>
        plannedCourses.map((course) => ({
          scenarioId: scenario.scenarioId,
          courseId: course.id,
          rawScore: normalizeDraftValue(drafts[makeDraftKey(scenario.scenarioId, course.id)]) || null,
          scoreType: course.scoreType,
        })),
      ),
    };

    savePlanningExpectationsMutation.mutate(payload, {
      onSuccess: (result) => {
        setDrafts(buildExpectationDrafts(result));
        clearStoredPlanningDraft();
        lastHydratedPlanningKeyRef.current = `${result.targetId}:${result.lastUpdatedAt}`;
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "保存预期成绩失败。");
      },
    });
  };

  const restoreSavedPlanning = (force = false) => {
    if (!planning) {
      return;
    }

    if (!force && hasUnsavedChanges && !confirmDiscardChanges()) {
      return;
    }

    setTargetGpa(planning.targetGpa);
    setDrafts(buildExpectationDrafts(planning));
    setFormError(null);
    clearStoredPlanningDraft();
    lastHydratedPlanningKeyRef.current = `${planning.targetId}:${planning.lastUpdatedAt}`;
  };

  const handlePlanningKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (planning) {
        handleSaveExpectations();
      } else {
        handleCreateTarget();
      }
      return;
    }

    if (event.key === "Escape" && hasUnsavedChanges) {
      event.preventDefault();
      if (planning) {
        restoreSavedPlanning();
        return;
      }
      if (confirmDiscardChanges()) {
        setTargetGpa("3.820");
        setDrafts({});
        setFormError(null);
        clearStoredPlanningDraft();
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Planning Workspace"
        title="最近一次规划结果和当前本地编辑需要被明确分开，才能真正适合长期反复使用。"
        description="规划页现在把“最近一次保存结果”当作稳定锚点展示；你在编辑区里改目标或改预期成绩时，会明确提示哪些内容还只是本地草稿。"
        actions={
          <>
            <Badge variant="outline">历史规划恢复</Badge>
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw data-icon="inline-start" className={isFetching ? "animate-spin" : ""} />
              {isFetching ? "同步中" : "刷新快照"}
            </Button>
          </>
        }
      />

      {planning ? (
        <div className="flex flex-col gap-3">
          <InlineMessage tone={hasUnsavedChanges ? "warning" : "info"}>
            {hasUnsavedChanges
              ? `当前有未保存规划草稿：${isTargetDirty ? "目标 GPA 已改动" : "目标 GPA 未改动"}，${
                  dirtySummary.changedExpectationCount
                } 个情景单元格与最近一次保存结果不同。下方三情景结果仍然展示最近一次已保存结果。`
              : "当前编辑区已与最近一次保存结果同步，可以继续查看历史结论，也可以直接开始下一轮调整。"}
          </InlineMessage>
          {storedPlanningDraft && hasUnsavedChanges ? (
            <InlineMessage tone="neutral">
              当前草稿已写入本地缓存。即使误切页或关闭窗口，下次回到规划页也会自动恢复。
            </InlineMessage>
          ) : null}
          {partialScenarios.length ? (
            <InlineMessage tone="warning">
              最近一次保存结果里仍有 {partialScenarios.length} 个情景未覆盖全部未修课程，相关模拟值只代表已填写课程范围。
            </InlineMessage>
          ) : null}
        </div>
      ) : (
        <InlineMessage tone="neutral">
          当前还没有历史规划。先创建目标 GPA，后续首页和规划页都会自动保留最近一次结果。
        </InlineMessage>
      )}

      {formError ? <InlineMessage tone="error">{formError}</InlineMessage> : null}

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div ref={savedPlanningRef}>
          <Card
            className={
              focusSavedPlanning
                ? "border-accent/22 shadow-[0_28px_90px_-36px_rgba(111,219,255,0.24)]"
                : undefined
            }
          >
            <CardHeader>
              <CardTitle>最近一次保存的规划</CardTitle>
              <CardDescription>
                这是应用关闭后也能快速恢复的稳定结果视图，不会被当前页里的未保存草稿直接覆盖。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {planning ? (
                <>
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                      <History className="size-3.5" />
                      Saved Target
                    </div>
                    <div className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-foreground">
                      {formatDecimal(planning.targetGpa)}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-foreground/76">
                      <Clock3 className="size-4 text-accent" />
                      最近更新 {formatDateTime(planning.lastUpdatedAt)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <SnapshotStat
                      label="可达性"
                      value={planningFeasibilityLabel}
                      description={planning.infeasibleReason ?? "当前目标仍然可以继续推进。"}
                    />
                    <SnapshotStat
                      label="未修总学分"
                      value={formatCredit(planning.plannedCreditSum)}
                      description="这是最近一次规划覆盖的未修课程总量。"
                    />
                  </div>

                  <Button variant="secondary" onClick={() => restoreSavedPlanning()} disabled={!hasUnsavedChanges}>
                    <RotateCcw data-icon="inline-start" />
                    恢复到最近保存结果
                  </Button>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                  还没有历史规划结果。创建目标后，这里会固定显示目标 GPA、最近更新时间和最近一次保存的摘要。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>当前编辑区</CardTitle>
            <CardDescription>
              这里承载新的目标输入和本地草稿。只有在你明确点击保存或重建后，历史规划结果才会被更新。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" onKeyDown={handlePlanningKeyDown}>
            <div className="flex flex-col gap-4">
              <Field label="Target GPA">
                <Input
                  value={targetGpa}
                  onChange={(event) => setTargetGpa(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreateTarget();
                    }
                  }}
                  placeholder="例如：3.820"
                />
              </Field>

              <AsyncButton
                onClick={handleCreateTarget}
                pending={createPlanningTargetMutation.isPending}
                idleLabel={planning ? "重建目标并刷新历史结果" : "创建目标"}
                pendingLabel="计算中..."
                icon={<Calculator data-icon="inline-start" />}
              />

              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-foreground/76">
                当前基线：已计入 GPA 学分 {formatCredit(planning?.basedOnCompletedCreditSum ?? data?.summary.countedCreditSum)}，
                当前 GPA {formatDecimal(planning?.basedOnCurrentGpa ?? data?.summary.currentGpa)}。
              </div>
            </div>

            <div className="grid gap-3">
              <SnapshotStat
                label="目标输入状态"
                value={planning ? (isTargetDirty ? "未保存" : "已同步") : "待创建"}
                description={
                  planning
                    ? isTargetDirty
                      ? `当前输入 ${normalizeDraftValue(targetGpa) || "--"} 尚未写回最近一次保存结果。`
                      : "当前输入与最近一次保存的目标 GPA 一致。"
                    : "先创建一个目标 GPA，后续才会生成完整的历史结果。"
                }
              />
              <SnapshotStat
                label="本地草稿改动"
                value={`${dirtySummary.changedExpectationCount}`}
                description={
                  planning
                    ? dirtySummary.changedExpectationCount
                      ? `共影响 ${dirtySummary.changedScenarioCount} 个情景，保存后才会重算三情景结果。`
                      : "当前没有未保存的预期成绩改动。"
                    : "还没有可编辑的历史规划草稿。"
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>最近一次保存结论</CardTitle>
          <CardDescription>
            这里固定显示最近一次已经落库的规划解释，避免把正在编辑的草稿误认为已经生效。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/8 bg-gradient-to-br from-accent/14 to-transparent p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              <Target className="size-3.5" />
              Required Future Average
            </div>
            <div className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-foreground">
              {formatDecimal(planning?.requiredFutureAverageGp)}
            </div>
            <div className="mt-4 text-sm leading-7 text-foreground/76">
              {planning?.requiredScoreText ?? "先创建目标 GPA，这里才会显示未来平均要求。"}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Feasibility
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {planningFeasibilityLabel}
            </div>
            <div className="mt-4 text-sm leading-7 text-foreground/76">
              {planning?.infeasibleReason ?? "当前目标在现有课程边界内仍可继续推演。"}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold tracking-tight text-foreground">最近一次保存的三情景结果</div>
          <div className="mt-1 text-sm text-muted-foreground">
            三张卡片只显示已保存结果；本地草稿改动不会在保存前混入这里。
          </div>
        </div>
        {planning ? <Badge variant="secondary">最近更新 {formatDateTime(planning.lastUpdatedAt)}</Badge> : null}
      </section>

      {planning?.scenarios.length ? (
        <section className="grid gap-4 lg:grid-cols-3">
          {planning.scenarios.map((scenario) => (
            <Card
              key={scenario.scenarioId}
              className={
                scenario.isFullCoverage
                  ? ""
                  : "border-red-400/18 shadow-[0_28px_90px_-44px_rgba(248,113,113,0.42)]"
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{formatScenarioLabel(scenario.scenarioType)}</CardTitle>
                    <CardDescription>
                      覆盖 {scenario.expectationCount} / {plannedCourses.length} 门未修课程
                    </CardDescription>
                  </div>
                  <Badge variant={scenario.isFullCoverage ? "success" : "destructive"}>
                    {scenario.isFullCoverage ? "已全覆盖" : "未全覆盖"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="text-4xl font-semibold tracking-[-0.06em] text-foreground">
                  {formatDecimal(scenario.simulatedFinalGpa)}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  已覆盖 {formatCredit(scenario.coveredPlannedCredit)} 学分，倒推未来平均绩点要求{" "}
                  {formatDecimal(scenario.requiredFutureAverageGp)}。
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <InlineMessage tone="neutral">
          还没有历史三情景结果。先创建目标 GPA，再保存未修课程预期成绩，这里才会出现三情景卡片。
        </InlineMessage>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>未修课程预期成绩编辑区</CardTitle>
              <CardDescription>
                输入框里的值都是当前草稿。每个单元格都会明确提示“已保存值”和“本地未保存值”的差异。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {planning ? (
                <Button variant="secondary" onClick={() => restoreSavedPlanning()} disabled={!hasUnsavedChanges}>
                  <RotateCcw data-icon="inline-start" />
                  放弃本地草稿
                </Button>
              ) : null}
              <AsyncButton
                onClick={handleSaveExpectations}
                disabled={!planning || !plannedCourses.length}
                pending={savePlanningExpectationsMutation.isPending}
                idleLabel="保存预期并重算"
                pendingLabel="保存并重算中..."
                icon={<Save data-icon="inline-start" />}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent onKeyDown={handlePlanningKeyDown}>
          {planning && plannedCourses.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>课程</TableHead>
                  <TableHead>学期</TableHead>
                  <TableHead>学分</TableHead>
                  {planningScenarios.map((scenario) => (
                    <TableHead key={scenario.scenarioId}>{formatScenarioLabel(scenario.scenarioType)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {plannedCourses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{course.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {course.scoreType === null
                          ? "未设置成绩类型，需先补齐"
                          : course.scoreType === "GRADE"
                            ? "等级制"
                            : "百分制"}
                      </div>
                    </TableCell>
                    <TableCell>{course.semester}</TableCell>
                    <TableCell>{formatCredit(course.credit)}</TableCell>
                    {planningScenarios.map((scenario) => (
                      <TableCell key={scenario.scenarioId} className="min-w-52 align-top">
                        <ScenarioInputCell
                          course={course}
                          scenario={scenario}
                          value={drafts[makeDraftKey(scenario.scenarioId, course.id)] ?? ""}
                          onChange={(value) =>
                            setDrafts((current) => ({
                              ...current,
                              [makeDraftKey(scenario.scenarioId, course.id)]: value,
                            }))
                          }
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <InlineMessage tone="neutral">
              {!planning
                ? "还没有创建目标 GPA，先完成目标输入后再填写三情景预期成绩。"
                : "当前没有未修课程，暂时不需要填写预期成绩。"}
            </InlineMessage>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioInputCell({
  course,
  scenario,
  value,
  onChange,
}: {
  course: CourseRecord;
  scenario: PlanningTargetResult["scenarios"][number];
  value: string;
  onChange: (value: string) => void;
}) {
  const expectation = scenario.expectations.find((item) => item.courseId === course.id) ?? null;
  const currentValue = normalizeDraftValue(value);
  const savedValue = normalizeDraftValue(expectation?.rawScore);
  const isDirty = currentValue !== savedValue;

  if (course.scoreType === null) {
    return (
      <div className="rounded-[20px] border border-dashed border-red-400/18 bg-red-400/8 px-3 py-3 text-xs leading-6 text-red-100">
        课程未设置成绩类型，无法保存该情景预期。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {course.scoreType === "GRADE" ? (
        <Select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">暂不填写</option>
          {gradeScoreOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="例如：92" />
      )}

      <div className={`text-xs leading-5 ${isDirty ? "text-amber-100" : "text-muted-foreground"}`}>
        {isDirty
          ? `本地草稿：${currentValue || "准备清空"} · 已保存：${savedValue || "未填写"}`
          : expectation
            ? `已保存：${expectation.rawScore} / 绩点 ${formatDecimal(expectation.gradePoint, 3, "--")}`
            : "当前情景尚未保存这门课程的预期成绩。"}
      </div>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-3 text-sm leading-6 text-foreground/72">{description}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
