import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Eraser,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAppPreferences } from "@/components/shared/app-preferences";
import { AsyncButton } from "@/components/shared/async-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { PageHero } from "@/components/shared/page-hero";
import { SortHeader, type SortDirection } from "@/components/shared/sort-header";
import { InlineMessage, StatePanel } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useClearScoreMutation,
  useRecordScoreMutation,
  useSnapshotQuery,
} from "@/hooks/use-snapshot-query";
import { formatDecimal } from "@/lib/format";
import { gradeScoreOptions } from "@/lib/score";
import type { CourseRecord, ScoreType, ScoreUpsertPayload } from "@/types/domain";

type ScoreFilter = "all" | "pending" | "recorded";
type ScoreSortKey = "name" | "semester" | "scoreType" | "status" | "rawScore" | "gradePoint";

type ScoreFormState = {
  scoreType: ScoreType | null;
  rawScore: string;
};

function normalizeScoreFilter(value: string | null): ScoreFilter {
  if (value === "all" || value === "recorded") {
    return value;
  }
  return "pending";
}

function toScoreForm(course: CourseRecord, defaultScoreType: ScoreType): ScoreFormState {
  return {
    scoreType: course.scoreType ?? defaultScoreType,
    rawScore: course.rawScore ?? "",
  };
}

function getScoreFormError(form: ScoreFormState) {
  if (form.scoreType === null) {
    return "请先设置成绩类型，再录入真实成绩。";
  }
  if (!form.rawScore.trim()) {
    return "成绩内容不能为空。";
  }
  if (form.scoreType === "PERCENTAGE") {
    const numeric = Number(form.rawScore);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      return "百分制成绩必须在 0 到 100 之间。";
    }
  }
  return null;
}

function matchesScoreFilter(course: CourseRecord, filter: ScoreFilter) {
  if (filter === "pending") {
    return !course.hasScore;
  }
  if (filter === "recorded") {
    return course.hasScore;
  }
  return true;
}

function matchesScoreSearch(course: CourseRecord, search: string) {
  if (!search) {
    return true;
  }

  const normalized = search.toLowerCase();
  return [course.name, course.semester, course.rawScore ?? ""].some((value) =>
    value.toLowerCase().includes(normalized),
  );
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", "zh-Hans-CN");
}

function compareNullableNumber(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = left === null || left === undefined || left === "" ? Number.NEGATIVE_INFINITY : Number(left);
  const rightValue =
    right === null || right === undefined || right === "" ? Number.NEGATIVE_INFINITY : Number(right);
  return leftValue - rightValue;
}

function sortScoreCourses(
  courses: CourseRecord[],
  key: ScoreSortKey,
  direction: SortDirection,
) {
  const ordered = [...courses].sort((left, right) => {
    const result =
      key === "name"
        ? left.name.localeCompare(right.name, "zh-Hans-CN")
        : key === "semester"
          ? left.semester.localeCompare(right.semester, "zh-Hans-CN")
          : key === "scoreType"
            ? compareNullableText(left.scoreType, right.scoreType)
            : key === "status"
              ? Number(left.hasScore) - Number(right.hasScore)
              : key === "rawScore"
                ? compareNullableText(left.rawScore, right.rawScore)
                : compareNullableNumber(left.gradePoint, right.gradePoint);

    if (result !== 0) {
      return direction === "asc" ? result : -result;
    }

    return (
      right.semester.localeCompare(left.semester, "zh-Hans-CN") ||
      left.name.localeCompare(right.name, "zh-Hans-CN")
    );
  });

  return ordered;
}

export function ScoreManagementPage() {
  const [searchParams] = useSearchParams();
  const { preferences } = useAppPreferences();
  const snapshotQuery = useSnapshotQuery();
  const recordScoreMutation = useRecordScoreMutation();
  const clearScoreMutation = useClearScoreMutation();

  const courses = snapshotQuery.data?.courses ?? [];
  const completedCourses = useMemo(
    () => courses.filter((course) => course.status === "COMPLETED"),
    [courses],
  );
  const pendingCount = completedCourses.filter((course) => !course.hasScore).length;
  const recordedCount = completedCourses.filter((course) => course.hasScore).length;

  const [activeFilter, setActiveFilter] = useState<ScoreFilter>(() =>
    normalizeScoreFilter(searchParams.get("filter")),
  );
  const [searchText, setSearchText] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ScoreSortKey>("semester");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [form, setForm] = useState<ScoreFormState>({
    scoreType: preferences.defaultScoreType,
    rawScore: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const percentageInputRef = useRef<HTMLInputElement>(null);
  const gradeSelectRef = useRef<HTMLSelectElement>(null);

  const deferredSearch = useDeferredValue(searchText.trim());
  const filteredCourses = useMemo(
    () =>
      sortScoreCourses(
        completedCourses.filter(
          (course) =>
            matchesScoreFilter(course, activeFilter) && matchesScoreSearch(course, deferredSearch),
        ),
        sortKey,
        sortDirection,
      ),
    [activeFilter, completedCourses, deferredSearch, sortDirection, sortKey],
  );
  const selectedCourse = completedCourses.find((course) => course.id === selectedCourseId) ?? null;
  const isSaving = recordScoreMutation.isPending;

  useEffect(() => {
    if (selectedCourseId && !completedCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [completedCourses, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId && completedCourses.length) {
      const preferred = completedCourses.find((course) => !course.hasScore) ?? completedCourses[0];
      setSelectedCourseId(preferred.id);
    }
  }, [completedCourses, selectedCourseId]);

  useEffect(() => {
    if (selectedCourse) {
      setForm(toScoreForm(selectedCourse, preferences.defaultScoreType));
      setFormError(null);
      window.requestAnimationFrame(() => {
        if ((selectedCourse.scoreType ?? preferences.defaultScoreType) === "GRADE") {
          gradeSelectRef.current?.focus();
        } else {
          percentageInputRef.current?.focus();
        }
      });
    }
  }, [preferences.defaultScoreType, selectedCourse]);

  function handleToggleSort(key: ScoreSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" ? "asc" : "desc");
  }

  function handleSelectCourse(course: CourseRecord) {
    setSelectedCourseId(course.id);
    setForm(toScoreForm(course, preferences.defaultScoreType));
    setFormError(null);
  }

  function handleSave() {
    if (!selectedCourse) {
      setFormError("请先从右侧表格中选择一门已修课程。");
      return;
    }

    const validationError = getScoreFormError(form);
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
    const nextPendingCourse =
      preferences.autoSelectNextPendingScore && !selectedCourse.hasScore
        ? completedCourses.find((course) => course.id !== selectedCourse.id && !course.hasScore)
        : null;

    recordScoreMutation.mutate(payload, {
      onSuccess: (course) => {
        if (nextPendingCourse) {
          setSelectedCourseId(nextPendingCourse.id);
          setForm(toScoreForm(nextPendingCourse, preferences.defaultScoreType));
          return;
        }

        setSelectedCourseId(course.id);
        setForm(toScoreForm(course, preferences.defaultScoreType));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "保存成绩失败。");
      },
    });
  }

  function handleClear() {
    if (!selectedCourse) {
      return;
    }

    setFormError(null);
    clearScoreMutation.mutate(selectedCourse.id, {
      onSuccess: (course) => {
        setClearDialogOpen(false);
        setSelectedCourseId(course.id);
        setForm(toScoreForm(course, preferences.defaultScoreType));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "清空成绩失败。");
      },
    });
  }

  const inlineValidation = getScoreFormError(form);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Score Workspace"
        title="成绩页现在更适合连续补录：支持排序、默认成绩类型和保存后自动跳下一门待录入课程。"
        description="左侧用于真实成绩录入，右侧用于搜索、筛选和排序。这样既能优先处理待录入课程，也能快速回头修改已录入成绩。"
        actions={
          <>
            <Badge variant="outline">待录入 / 已录入筛选</Badge>
            <Badge variant="secondary">
              自动跳下一门 {preferences.autoSelectNextPendingScore ? "开启" : "关闭"}
            </Badge>
            <Button
              variant="secondary"
              onClick={() => void snapshotQuery.refetch()}
              disabled={snapshotQuery.isFetching}
            >
              <RefreshCw data-icon="inline-start" className={snapshotQuery.isFetching ? "animate-spin" : ""} />
              {snapshotQuery.isFetching ? "同步中..." : "刷新快照"}
            </Button>
          </>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <CardHeader>
            <CardTitle>成绩录入工作台</CardTitle>
            <CardDescription>
              选择已修课程后，可以录入、修改或清空真实成绩。保存后 GPA、规划基线和首页指标会一起刷新。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {formError ? <InlineMessage tone="error">{formError}</InlineMessage> : null}

            {snapshotQuery.isLoading ? (
              <InlineMessage tone="neutral">正在加载可录入课程...</InlineMessage>
            ) : snapshotQuery.isError ? (
              <InlineMessage tone="error">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "成绩列表加载失败，请稍后重试。"}
              </InlineMessage>
            ) : selectedCourse ? (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold text-foreground">{selectedCourse.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{selectedCourse.semester}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ScoreTypeBadge scoreType={selectedCourse.scoreType} />
                  <Badge variant={selectedCourse.hasScore ? "success" : "warning"}>
                    {selectedCourse.hasScore ? "已录入" : "待录入"}
                  </Badge>
                </div>
              </div>
            ) : (
              <InlineMessage tone="neutral">当前没有可录入的已修课程。</InlineMessage>
            )}

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="待录入" value={pendingCount} />
              <MetricCard label="已录入" value={recordedCount} />
            </div>

            <Field
              label="成绩类型"
              description="默认值来自设置；切换类型时会清空当前输入，避免误把等级制当百分制。"
            >
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

            <Field
              label={form.scoreType === "GRADE" ? "等级成绩" : "原始成绩"}
              description={
                inlineValidation && form.rawScore.trim()
                  ? inlineValidation
                  : form.scoreType === "GRADE"
                    ? "支持优 / 良好 / 中等 / 及格 / 不及格。"
                    : "百分制会即时校验 0 到 100。"
              }
              error={inlineValidation && form.rawScore.trim() ? inlineValidation : null}
            >
              {form.scoreType === "GRADE" ? (
                <Select
                  ref={gradeSelectRef}
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
                  ref={percentageInputRef}
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
              <InlineMessage tone="neutral">
                当前已录入成绩：{selectedCourse.rawScore}，对应绩点{" "}
                {formatDecimal(selectedCourse.gradePoint, 3, "--")}。
              </InlineMessage>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <AsyncButton
                onClick={handleSave}
                disabled={!selectedCourse}
                pending={isSaving}
                idleLabel={selectedCourse?.hasScore ? "更新成绩" : "录入成绩"}
                pendingLabel="保存中..."
                icon={<Save data-icon="inline-start" />}
              />

              <Button
                variant="destructive"
                onClick={() => setClearDialogOpen(true)}
                disabled={!selectedCourse?.hasScore || clearScoreMutation.isPending}
              >
                <Eraser data-icon="inline-start" />
                清空成绩
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeFilter} onValueChange={(value) => setActiveFilter(value as ScoreFilter)}>
          <TabsList>
            <TabsTrigger value="pending">待录入 {pendingCount}</TabsTrigger>
            <TabsTrigger value="recorded">已录入 {recordedCount}</TabsTrigger>
            <TabsTrigger value="all">全部 {completedCourses.length}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter}>
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>成绩课程表</CardTitle>
                    <CardDescription>
                      支持按待录入、已录入切换，也支持按课程名、学期、绩点等字段排序。
                    </CardDescription>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    当前结果 {filteredCourses.length} / {completedCourses.length}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="搜索课程名称、学期或原始成绩"
                      className="pl-11"
                    />
                  </div>
                  <Button variant="outline" onClick={() => setSearchText("")} disabled={!searchText}>
                    <X data-icon="inline-start" />
                    清空搜索
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {snapshotQuery.isLoading ? (
                  <StatePanel tone="neutral">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在加载成绩列表...
                  </StatePanel>
                ) : snapshotQuery.isError ? (
                  <StatePanel tone="error">
                    <div>
                      <div className="font-medium text-foreground">成绩列表加载失败</div>
                      <div className="mt-1 text-sm leading-6 text-foreground/76">
                        {snapshotQuery.error instanceof Error
                          ? snapshotQuery.error.message
                          : "请检查 bridge 或本地数据库后重试。"}
                      </div>
                    </div>
                    <Button variant="secondary" onClick={() => void snapshotQuery.refetch()}>
                      重试
                    </Button>
                  </StatePanel>
                ) : !completedCourses.length ? (
                  <StatePanel tone="neutral">
                    <div>
                      <div className="font-medium text-foreground">还没有已修课程</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        只有已修课程会出现在成绩页。可以先到课程页把课程状态补齐。
                      </div>
                    </div>
                  </StatePanel>
                ) : filteredCourses.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHeader
                          label="课程"
                          active={sortKey === "name"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("name")}
                        />
                        <SortHeader
                          label="学期"
                          active={sortKey === "semester"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("semester")}
                        />
                        <SortHeader
                          label="成绩类型"
                          active={sortKey === "scoreType"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("scoreType")}
                        />
                        <SortHeader
                          label="状态"
                          active={sortKey === "status"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("status")}
                        />
                        <SortHeader
                          label="原始成绩"
                          active={sortKey === "rawScore"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("rawScore")}
                        />
                        <SortHeader
                          label="绩点"
                          active={sortKey === "gradePoint"}
                          direction={sortDirection}
                          onToggle={() => handleToggleSort("gradePoint")}
                        />
                        <TableHead className="w-[120px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCourses.map((course) => {
                        const isActive = selectedCourseId === course.id;

                        return (
                          <TableRow key={course.id} className={isActive ? "bg-white/[0.05]" : ""}>
                            <TableCell className="font-medium text-foreground">{course.name}</TableCell>
                            <TableCell>{course.semester}</TableCell>
                            <TableCell>
                              <ScoreTypeBadge scoreType={course.scoreType} />
                            </TableCell>
                            <TableCell>
                              <Badge variant={course.hasScore ? "success" : "warning"}>
                                {course.hasScore ? "已录入" : "待录入"}
                              </Badge>
                            </TableCell>
                            <TableCell>{course.rawScore ?? "--"}</TableCell>
                            <TableCell>{formatDecimal(course.gradePoint, 3, "--")}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={isActive ? "default" : "secondary"}
                                onClick={() => handleSelectCourse(course)}
                              >
                                {course.hasScore ? "编辑" : "录入"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <StatePanel tone="neutral">
                    <div>
                      <div className="font-medium text-foreground">当前筛选下没有课程</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        可以清空搜索词，或切换到其他录入状态。
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearchText("");
                        setActiveFilter("all");
                      }}
                    >
                      清空筛选
                    </Button>
                  </StatePanel>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="确认清空当前成绩？"
        description="清空后，这门课会从当前 GPA 统计中移除，首页指标和目标规划结果也会同步回滚。"
        confirmLabel="确认清空"
        pendingLabel="清空中..."
        onConfirm={handleClear}
        pending={clearScoreMutation.isPending}
        tone="danger"
      />
    </div>
  );
}

function Field({
  label,
  children,
  description,
  error,
}: {
  label: string;
  children: ReactNode;
  description?: string;
  error?: string | null;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      {children}
      <span className={error ? "text-sm text-red-200" : "text-sm text-muted-foreground"}>
        {error ?? description}
      </span>
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
