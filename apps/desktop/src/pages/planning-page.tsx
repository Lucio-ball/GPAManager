import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calculator, RefreshCw, Save, Target } from "lucide-react";
import { AsyncButton } from "@/components/shared/async-button";
import { PageHero } from "@/components/shared/page-hero";
import { InlineMessage } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCreatePlanningTargetMutation,
  useSavePlanningExpectationsMutation,
  useSnapshotQuery,
} from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal, formatScenarioLabel } from "@/lib/format";
import { gradeScoreOptions } from "@/lib/score";
import type { CourseRecord, PlanningExpectationSavePayload, PlanningTargetResult } from "@/types/domain";

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

function validateTargetGpa(targetGpa: string) {
  const numeric = Number(targetGpa);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 4) {
    return "目标 GPA 必须是 0 到 4 之间的数字。";
  }
  return null;
}

export function PlanningPage() {
  const { data, isFetching, refetch } = useSnapshotQuery();
  const createPlanningTargetMutation = useCreatePlanningTargetMutation();
  const savePlanningExpectationsMutation = useSavePlanningExpectationsMutation();

  const courses = data?.courses ?? [];
  const plannedCourses = courses.filter((course) => course.status === "PLANNED");
  const planning = data?.latestPlanning ?? null;
  const planningScenarios = planning?.scenarios ?? [];
  const planningFeasibilityLabel =
    planning?.feasible === null
      ? "待计算"
      : planning?.feasible
        ? "可达成"
        : "不可达";

  const [targetGpa, setTargetGpa] = useState("3.820");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (planning?.targetGpa) {
      setTargetGpa(planning.targetGpa);
    }
  }, [planning?.targetGpa]);

  useEffect(() => {
    setDrafts(buildExpectationDrafts(planning));
    setFormError(null);
  }, [planning]);

  const partialScenarios = useMemo(
    () => planning?.scenarios.filter((scenario) => !scenario.isFullCoverage) ?? [],
    [planning],
  );

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
          rawScore: (drafts[makeDraftKey(scenario.scenarioId, course.id)] ?? "").trim() || null,
          scoreType: course.scoreType,
        })),
      ),
    };

    savePlanningExpectationsMutation.mutate(payload, {
      onSuccess: (result) => {
        setDrafts(buildExpectationDrafts(result));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "保存预期成绩失败。");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Planning Workspace"
        title="目标 GPA、未修课程预期成绩和三情景结果现在共享同一条真实计算链路。"
        description="先创建规划目标，再把每门未修课程在乐观、中性、保守三种场景下的预期成绩保存进去，结果会立刻重算。"
        actions={
          <>
            <Badge variant="outline">目标 GPA 倒推</Badge>
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw data-icon="inline-start" className={isFetching ? "animate-spin" : ""} />
              {isFetching ? "同步中" : "刷新快照"}
            </Button>
          </>
        }
      />

      {partialScenarios.length ? (
        <InlineMessage tone="warning">
          当前仍有 {partialScenarios.length} 个情景未覆盖全部未修课程，结果仅代表已填写课程范围内的模拟值。
        </InlineMessage>
      ) : null}

      {formError ? <InlineMessage tone="error">{formError}</InlineMessage> : null}

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>目标输入区</CardTitle>
            <CardDescription>
              创建或重建目标 GPA 时，会按当前成绩基线重新计算未来平均绩点要求。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Target GPA">
              <Input
                value={targetGpa}
                onChange={(event) => setTargetGpa(event.target.value)}
                placeholder="例如：3.820"
              />
            </Field>

            <AsyncButton
              onClick={handleCreateTarget}
              pending={createPlanningTargetMutation.isPending}
              idleLabel="创建 / 重建目标"
              pendingLabel="计算中..."
              icon={<Calculator data-icon="inline-start" />}
            />

            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-foreground/76">
              当前基线：已计入 GPA 学分 {formatCredit(planning?.basedOnCompletedCreditSum)}，当前 GPA{" "}
              {formatDecimal(planning?.basedOnCurrentGpa)}。
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>规划结论</CardTitle>
            <CardDescription>
              这里直接汇总未来平均绩点要求、目标可达性和解释文本，不需要再手工换算。
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
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {planning?.scenarios.map((scenario) => (
          <Card
            key={scenario.scenarioId}
            className={scenario.isFullCoverage ? "" : "border-red-400/18 shadow-[0_28px_90px_-44px_rgba(248,113,113,0.42)]"}
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
        )) ?? null}
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>未修课程预期成绩矩阵</CardTitle>
              <CardDescription>
                每一列对应一个规划情景。保存后会直接重算三情景结果，并把未全覆盖状态标红提示。
              </CardDescription>
            </div>
            <AsyncButton
              onClick={handleSaveExpectations}
              disabled={!planning || !plannedCourses.length}
              pending={savePlanningExpectationsMutation.isPending}
              idleLabel="保存预期并重算"
              pendingLabel="保存并重算中..."
              icon={<Save data-icon="inline-start" />}
            />
          </div>
        </CardHeader>
        <CardContent>
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

      <div className="text-xs leading-5 text-muted-foreground">
        {expectation
          ? `已保存：${expectation.rawScore} / 绩点 ${formatDecimal(expectation.gradePoint, 3, "--")}`
          : "当前情景尚未保存这门课程的预期成绩。"}
      </div>
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
