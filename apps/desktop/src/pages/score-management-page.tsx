import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Eraser, RefreshCw, Save } from "lucide-react";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { PageHero } from "@/components/shared/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useClearScoreMutation,
  useRecordScoreMutation,
  useSnapshotQuery,
} from "@/hooks/use-snapshot-query";
import { formatDecimal } from "@/lib/format";
import { gradeScoreOptions } from "@/lib/score";
import type { CourseRecord, ScoreType, ScoreUpsertPayload } from "@/types/domain";

type ScoreFormState = {
  scoreType: ScoreType | null;
  rawScore: string;
};

function toScoreForm(course: CourseRecord): ScoreFormState {
  return {
    scoreType: course.scoreType,
    rawScore: course.rawScore ?? "",
  };
}

function validateScoreForm(form: ScoreFormState) {
  if (form.scoreType === null) {
    return "请先设置成绩类型，再录入真实成绩。";
  }
  if (!form.rawScore.trim()) {
    return "成绩内容不能为空。";
  }
  return null;
}

export function ScoreManagementPage() {
  const { data, isFetching, refetch } = useSnapshotQuery();
  const recordScoreMutation = useRecordScoreMutation();
  const clearScoreMutation = useClearScoreMutation();

  const courses = data?.courses ?? [];
  const missingScores = courses.filter((course) => course.status === "COMPLETED" && !course.hasScore);
  const recordedScores = courses.filter((course) => course.status === "COMPLETED" && course.hasScore);
  const selectableCourses = useMemo(
    () => [...missingScores, ...recordedScores],
    [missingScores, recordedScores],
  );

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<ScoreFormState>({ scoreType: null, rawScore: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCourse = selectableCourses.find((course) => course.id === selectedCourseId) ?? null;
  const isSaving = recordScoreMutation.isPending;

  useEffect(() => {
    if (selectedCourseId && !selectableCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [selectableCourses, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId && selectableCourses.length) {
      setSelectedCourseId(selectableCourses[0].id);
    }
  }, [selectableCourses, selectedCourseId]);

  useEffect(() => {
    if (selectedCourse) {
      setForm(toScoreForm(selectedCourse));
      setFormError(null);
    }
  }, [selectedCourse]);

  const handleSelectCourse = (course: CourseRecord) => {
    setSelectedCourseId(course.id);
    setForm(toScoreForm(course));
    setFormError(null);
  };

  const handleSave = () => {
    if (!selectedCourse) {
      setFormError("请先从左侧待录入列表或右侧已录入表格中选择一门课程。");
      return;
    }

    const validationError = validateScoreForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    const payload: ScoreUpsertPayload = {
      courseId: selectedCourse.id,
      rawScore: form.rawScore.trim(),
      scoreType: form.scoreType,
    };

    recordScoreMutation.mutate(payload, {
      onSuccess: (course) => {
        setSelectedCourseId(course.id);
        setForm(toScoreForm(course));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "保存成绩失败。");
      },
    });
  };

  const handleClear = () => {
    if (!selectedCourse) {
      return;
    }

    setFormError(null);
    clearScoreMutation.mutate(selectedCourse.id, {
      onSuccess: (course) => {
        setSelectedCourseId(course.id);
        setForm(toScoreForm(course));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "清空成绩失败。");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Score Workspace"
        title="成绩录入正式进入真写入状态，已录入可修改、可清空，并且首页 GPA 会即时跟着刷新。"
        description="左侧专注于操作，右侧保留核对表格。你可以从待补录列表进入，也可以直接点右表已有成绩做修订。"
        actions={
          <>
            <Badge variant="outline">真实成绩录入</Badge>
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw data-icon="inline-start" className={isFetching ? "animate-spin" : ""} />
              {isFetching ? "同步中" : "刷新快照"}
            </Button>
          </>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
            <CardHeader>
              <CardTitle>成绩录入工作台</CardTitle>
              <CardDescription>
                先选课程，再录入或修订真实成绩。保存后 GPA、规划基线和首页指标会统一刷新。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {formError ? <Notice tone="error">{formError}</Notice> : null}

              {selectedCourse ? (
                <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
                  <div className="text-sm font-semibold text-foreground">{selectedCourse.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{selectedCourse.semester}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CourseStatusBadge status={selectedCourse.status} />
                    <ScoreTypeBadge scoreType={selectedCourse.scoreType} />
                  </div>
                </div>
              ) : (
                <Notice tone="neutral">当前没有可录入成绩的已修课程。</Notice>
              )}

              <Field label="成绩类型">
                <Select
                  value={form.scoreType ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scoreType: (event.target.value || null) as ScoreType | null,
                      rawScore:
                        current.scoreType && current.scoreType !== event.target.value
                          ? ""
                          : current.rawScore,
                    }))
                  }
                  disabled={!selectedCourse}
                >
                  <option value="">请选择成绩类型</option>
                  <option value="PERCENTAGE">百分制</option>
                  <option value="GRADE">等级制</option>
                </Select>
              </Field>

              <Field label={form.scoreType === "GRADE" ? "等级成绩" : "原始成绩"}>
                {form.scoreType === "GRADE" ? (
                  <Select
                    value={form.rawScore}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, rawScore: event.target.value }))
                    }
                    disabled={!selectedCourse}
                  >
                    <option value="">请选择等级</option>
                    {gradeScoreOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={form.rawScore}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, rawScore: event.target.value }))
                    }
                    placeholder="例如：92"
                    disabled={!selectedCourse}
                  />
                )}
              </Field>

              {selectedCourse?.hasScore ? (
                <Notice tone="neutral">
                  当前已录入成绩：{selectedCourse.rawScore}，对应绩点{" "}
                  {formatDecimal(selectedCourse.gradePoint, 3, "--")}。
                </Notice>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={handleSave} disabled={!selectedCourse || isSaving}>
                  <Save data-icon="inline-start" />
                  {isSaving ? "保存中..." : selectedCourse?.hasScore ? "更新成绩" : "录入成绩"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={!selectedCourse?.hasScore || clearScoreMutation.isPending}
                >
                  <Eraser data-icon="inline-start" />
                  {clearScoreMutation.isPending ? "清空中..." : "清空成绩"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>待补录清单</CardTitle>
              <CardDescription>优先处理还未计入 GPA 的已修课程，减少首页快照和真实数据的差距。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {missingScores.length ? (
                missingScores.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => handleSelectCourse(course)}
                    className={
                      selectedCourseId === course.id
                        ? "rounded-[22px] border border-accent/24 bg-accent/10 p-4 text-left"
                        : "rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.05]"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{course.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{course.semester}</div>
                      </div>
                      <CircleAlert className="size-4.5 text-amber-300" />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <CourseStatusBadge status={course.status} />
                      <ScoreTypeBadge scoreType={course.scoreType} />
                    </div>
                  </button>
                ))
              ) : (
                <Notice tone="neutral">当前没有待补录的已修课程。</Notice>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>已录入成绩</CardTitle>
            <CardDescription>右侧表格承担核对职责，点击任意行即可把该课程带回左侧工作台继续修改或清空。</CardDescription>
          </CardHeader>
          <CardContent>
            {recordedScores.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>课程</TableHead>
                    <TableHead>学期</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>原始成绩</TableHead>
                    <TableHead>绩点</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordedScores.map((course) => (
                    <TableRow
                      key={course.id}
                      className={selectedCourseId === course.id ? "bg-white/[0.05]" : "cursor-pointer"}
                      onClick={() => handleSelectCourse(course)}
                    >
                      <TableCell className="font-medium text-foreground">{course.name}</TableCell>
                      <TableCell>{course.semester}</TableCell>
                      <TableCell>
                        <ScoreTypeBadge scoreType={course.scoreType} />
                      </TableCell>
                      <TableCell>{course.rawScore}</TableCell>
                      <TableCell>{formatDecimal(course.gradePoint, 3, "--")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Notice tone="neutral">还没有任何已录入成绩，先从左侧待补录课程开始。</Notice>
            )}
          </CardContent>
        </Card>
      </section>
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

function Notice({
  tone,
  children,
}: {
  tone: "error" | "neutral";
  children: ReactNode;
}) {
  const className =
    tone === "error"
      ? "border border-red-400/18 bg-red-400/10 text-red-100"
      : "border border-white/8 bg-white/[0.03] text-muted-foreground";

  return (
    <div className={`rounded-[22px] px-4 py-3 text-sm leading-6 ${className}`}>{children}</div>
  );
}
