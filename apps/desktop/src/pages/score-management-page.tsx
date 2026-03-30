import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
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
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import {
  useClearScoreMutation,
  useRecordScoreMutation,
  useSnapshotQuery,
} from "@/hooks/use-snapshot-query";
import { useUnsavedChangesProtection } from "@/hooks/use-unsaved-changes-protection";
import { formatDecimal } from "@/lib/format";
import { gradeScoreOptions } from "@/lib/score";
import type { CourseRecord, ScoreType, ScoreUpsertPayload } from "@/types/domain";

type ScoreFilter = "all" | "pending" | "recorded";
type ScoreSortKey = "name" | "semester" | "scoreType" | "status" | "rawScore" | "gradePoint";
type ScoreTypeFilter = "all" | "PERCENTAGE" | "GRADE" | "unset";

type ScoreFormState = {
  scoreType: ScoreType | null;
  rawScore: string;
};

type ScoreViewState = {
  activeFilter: ScoreFilter;
  searchText: string;
  sortKey: ScoreSortKey;
  sortDirection: SortDirection;
  semesterFilter: string;
  scoreTypeFilter: ScoreTypeFilter;
};

type ScoreDraftState = {
  selectedCourseId: string | null;
  form: ScoreFormState;
};

const SCORE_VIEW_STORAGE_KEY = "gpa-manager.desktop.score-view.v2";
const SCORE_DRAFT_STORAGE_KEY = "gpa-manager.desktop.score-draft.v1";

function normalizeScoreFilter(value: string | null | undefined): ScoreFilter {
  if (value === "all" || value === "recorded") {
    return value;
  }
  return "pending";
}

function normalizeScoreSortKey(value: string | null | undefined): ScoreSortKey {
  if (
    value === "name" ||
    value === "semester" ||
    value === "scoreType" ||
    value === "status" ||
    value === "rawScore" ||
    value === "gradePoint"
  ) {
    return value;
  }
  return "semester";
}

function normalizeSortDirection(value: string | null | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function normalizeScoreTypeFilter(value: string | null | undefined): ScoreTypeFilter {
  if (value === "PERCENTAGE" || value === "GRADE" || value === "unset") {
    return value;
  }
  return "all";
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

function scoreFormsEqual(left: ScoreFormState, right: ScoreFormState) {
  return left.scoreType === right.scoreType && left.rawScore.trim() === right.rawScore.trim();
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

function matchesSemester(course: CourseRecord, semester: string) {
  return !semester || course.semester === semester;
}

function matchesScoreType(course: CourseRecord, filter: ScoreTypeFilter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "unset") {
    return course.scoreType === null;
  }
  return course.scoreType === filter;
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

function sortScoreCourses(courses: CourseRecord[], key: ScoreSortKey, direction: SortDirection) {
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

function getInitialViewState(searchParams: URLSearchParams, stored?: Partial<ScoreViewState>): ScoreViewState {
  return {
    activeFilter: normalizeScoreFilter(searchParams.get("filter") ?? stored?.activeFilter),
    searchText: searchParams.get("q") ?? stored?.searchText ?? "",
    sortKey: normalizeScoreSortKey(searchParams.get("sort") ?? stored?.sortKey),
    sortDirection: normalizeSortDirection(searchParams.get("dir") ?? stored?.sortDirection),
    semesterFilter: searchParams.get("semester") ?? stored?.semesterFilter ?? "",
    scoreTypeFilter: normalizeScoreTypeFilter(searchParams.get("scoreType") ?? stored?.scoreTypeFilter),
  };
}

function getAdjacentCourse(courses: CourseRecord[], currentId: string | null, offset: number) {
  if (!courses.length) {
    return null;
  }

  const currentIndex = currentId ? courses.findIndex((course) => course.id === currentId) : -1;
  const nextIndex = currentIndex === -1 ? 0 : Math.min(courses.length - 1, Math.max(0, currentIndex + offset));
  return courses[nextIndex] ?? null;
}

export function ScoreManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { preferences } = useAppPreferences();
  const snapshotQuery = useSnapshotQuery();
  const recordScoreMutation = useRecordScoreMutation();
  const clearScoreMutation = useClearScoreMutation();
  const [storedViewState, setStoredViewState] = useLocalStorageState<Partial<ScoreViewState>>(
    SCORE_VIEW_STORAGE_KEY,
    {},
  );
  const [storedDraftState, setStoredDraftState, clearStoredDraftState] = useLocalStorageState<ScoreDraftState | null>(
    SCORE_DRAFT_STORAGE_KEY,
    null,
  );

  const courses = snapshotQuery.data?.courses ?? [];
  const completedCourses = useMemo(
    () => courses.filter((course) => course.status === "COMPLETED"),
    [courses],
  );
  const semesterOptions = useMemo(
    () => Array.from(new Set(completedCourses.map((course) => course.semester))).sort((left, right) =>
      right.localeCompare(left, "zh-Hans-CN"),
    ),
    [completedCourses],
  );
  const pendingCount = completedCourses.filter((course) => !course.hasScore).length;
  const recordedCount = completedCourses.filter((course) => course.hasScore).length;

  const [viewState, setViewState] = useState<ScoreViewState>(() =>
    getInitialViewState(searchParams, storedViewState),
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<ScoreFormState>({
    scoreType: preferences.defaultScoreType,
    rawScore: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const percentageInputRef = useRef<HTMLInputElement>(null);
  const gradeSelectRef = useRef<HTMLSelectElement>(null);
  const draftHydratedRef = useRef(false);

  const deferredSearch = useDeferredValue(viewState.searchText.trim());
  const filteredCourses = useMemo(
    () =>
      sortScoreCourses(
        completedCourses.filter(
          (course) =>
            matchesScoreFilter(course, viewState.activeFilter) &&
            matchesScoreSearch(course, deferredSearch) &&
            matchesSemester(course, viewState.semesterFilter) &&
            matchesScoreType(course, viewState.scoreTypeFilter),
        ),
        viewState.sortKey,
        viewState.sortDirection,
      ),
    [completedCourses, deferredSearch, viewState],
  );
  const selectedCourse = completedCourses.find((course) => course.id === selectedCourseId) ?? null;
  const defaultForm = useMemo(
    () => ({ scoreType: preferences.defaultScoreType, rawScore: "" }),
    [preferences.defaultScoreType],
  );
  const baselineForm = selectedCourse ? toScoreForm(selectedCourse, preferences.defaultScoreType) : defaultForm;
  const hasUnsavedChanges = !scoreFormsEqual(form, baselineForm);
  const { confirmDiscardChanges } = useUnsavedChangesProtection(
    hasUnsavedChanges,
    "当前成绩表单还有未保存修改，离开后会丢失。确定继续吗？",
  );
  const isSaving = recordScoreMutation.isPending;

  useEffect(() => {
    setStoredViewState(viewState);
  }, [setStoredViewState, viewState]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (viewState.activeFilter !== "pending") {
      nextParams.set("filter", viewState.activeFilter);
    }
    if (viewState.searchText.trim()) {
      nextParams.set("q", viewState.searchText.trim());
    }
    if (viewState.sortKey !== "semester") {
      nextParams.set("sort", viewState.sortKey);
    }
    if (viewState.sortDirection !== "desc") {
      nextParams.set("dir", viewState.sortDirection);
    }
    if (viewState.semesterFilter) {
      nextParams.set("semester", viewState.semesterFilter);
    }
    if (viewState.scoreTypeFilter !== "all") {
      nextParams.set("scoreType", viewState.scoreTypeFilter);
    }
    setSearchParams(nextParams, { replace: true });
  }, [setSearchParams, viewState]);

  useEffect(() => {
    if (selectedCourseId && !completedCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [completedCourses, selectedCourseId]);

  useEffect(() => {
    if (draftHydratedRef.current || snapshotQuery.isLoading) {
      return;
    }

    if (storedDraftState?.selectedCourseId) {
      const draftCourse = completedCourses.find((course) => course.id === storedDraftState.selectedCourseId);
      if (draftCourse) {
        setSelectedCourseId(draftCourse.id);
        setForm(storedDraftState.form);
        setFormError("已恢复上次未保存的成绩草稿。");
        draftHydratedRef.current = true;
        return;
      }
    }

    if (completedCourses.length) {
      const preferred = completedCourses.find((course) => !course.hasScore) ?? completedCourses[0];
      setSelectedCourseId(preferred.id);
      setForm(toScoreForm(preferred, preferences.defaultScoreType));
    }
    draftHydratedRef.current = true;
  }, [completedCourses, preferences.defaultScoreType, snapshotQuery.isLoading, storedDraftState]);

  useEffect(() => {
    if (!selectedCourseId && completedCourses.length) {
      const preferred = completedCourses.find((course) => !course.hasScore) ?? completedCourses[0];
      setSelectedCourseId(preferred.id);
    }
  }, [completedCourses, selectedCourseId]);

  useEffect(() => {
    if (selectedCourse) {
      if (!hasUnsavedChanges) {
        setForm(toScoreForm(selectedCourse, preferences.defaultScoreType));
      }
      setFormError(null);
      window.requestAnimationFrame(() => {
        if ((form.scoreType ?? selectedCourse.scoreType ?? preferences.defaultScoreType) === "GRADE") {
          gradeSelectRef.current?.focus();
        } else {
          percentageInputRef.current?.focus();
        }
      });
    }
  }, [hasUnsavedChanges, preferences.defaultScoreType, selectedCourse, form.scoreType]);

  useEffect(() => {
    if (hasUnsavedChanges && selectedCourseId) {
      setStoredDraftState({ selectedCourseId, form });
      return;
    }

    clearStoredDraftState();
  }, [clearStoredDraftState, form, hasUnsavedChanges, selectedCourseId, setStoredDraftState]);

  useEffect(() => {
    if (!selectedCourseId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`score-row-${selectedCourseId}`)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [filteredCourses, selectedCourseId]);

  function updateViewState(patch: Partial<ScoreViewState>) {
    setViewState((current) => ({ ...current, ...patch }));
  }

  function handleToggleSort(key: ScoreSortKey) {
    updateViewState(
      viewState.sortKey === key
        ? { sortDirection: viewState.sortDirection === "asc" ? "desc" : "asc" }
        : {
            sortKey: key,
            sortDirection: key === "name" ? "asc" : "desc",
          },
    );
  }

  function handleSelectCourse(course: CourseRecord) {
    if (selectedCourseId === course.id) {
      return;
    }
    if (!confirmDiscardChanges()) {
      return;
    }

    setSelectedCourseId(course.id);
    setForm(toScoreForm(course, preferences.defaultScoreType));
    setFormError(null);
  }

  function handleResetCurrentForm(force = false) {
    if (!selectedCourse) {
      setForm(defaultForm);
      return;
    }

    if (!force && hasUnsavedChanges && !confirmDiscardChanges()) {
      return;
    }

    setForm(toScoreForm(selectedCourse, preferences.defaultScoreType));
    setFormError(null);
  }

  function selectAdjacentCourse(offset: number) {
    const adjacent = getAdjacentCourse(filteredCourses, selectedCourseId, offset);
    if (!adjacent || adjacent.id === selectedCourseId) {
      return;
    }
    handleSelectCourse(adjacent);
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

    const currentIndex = filteredCourses.findIndex((course) => course.id === selectedCourse.id);
    const nextVisiblePendingCourse =
      preferences.autoSelectNextPendingScore && currentIndex >= 0
        ? filteredCourses.slice(currentIndex + 1).find((course) => !course.hasScore) ??
          filteredCourses.slice(0, currentIndex).find((course) => !course.hasScore)
        : null;

    recordScoreMutation.mutate(payload, {
      onSuccess: (course) => {
        if (nextVisiblePendingCourse && nextVisiblePendingCourse.id !== course.id) {
          setSelectedCourseId(nextVisiblePendingCourse.id);
          setForm(toScoreForm(nextVisiblePendingCourse, preferences.defaultScoreType));
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

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const tagName = target.tagName;

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSave();
      return;
    }

    if (event.key === "Enter" && tagName === "INPUT") {
      event.preventDefault();
      handleSave();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleResetCurrentForm();
      return;
    }

    if (event.key === "ArrowDown" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      selectAdjacentCourse(1);
      return;
    }

    if (event.key === "ArrowUp" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      selectAdjacentCourse(-1);
    }
  }

  const inlineValidation = getScoreFormError(form);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Score Workspace"
        title="成绩页现在更适合连续补录：组合筛选记忆、上下门切换、快捷保存和草稿恢复都围绕高频录入展开。"
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

      {hasUnsavedChanges ? (
        <InlineMessage tone="warning">
          当前成绩表单还有未保存内容。切换课程、切页或关闭窗口前都会再次确认，并且草稿会自动恢复。
        </InlineMessage>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <CardHeader>
            <CardTitle>成绩录入工作台</CardTitle>
            <CardDescription>
              Enter 直接保存，Ctrl+Enter 也可保存，Ctrl+方向键切换上一门/下一门，Esc 恢复到已保存状态。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4" onKeyDown={handleEditorKeyDown}>
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

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => selectAdjacentCourse(-1)} disabled={!filteredCourses.length}>
                <ArrowUp data-icon="inline-start" />
                上一门
              </Button>
              <Button variant="secondary" onClick={() => selectAdjacentCourse(1)} disabled={!filteredCourses.length}>
                <ArrowDown data-icon="inline-start" />
                下一门
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          value={viewState.activeFilter}
          onValueChange={(value) => updateViewState({ activeFilter: value as ScoreFilter })}
        >
          <TabsList>
            <TabsTrigger value="pending">待录入 {pendingCount}</TabsTrigger>
            <TabsTrigger value="recorded">已录入 {recordedCount}</TabsTrigger>
            <TabsTrigger value="all">全部 {completedCourses.length}</TabsTrigger>
          </TabsList>

          <TabsContent value={viewState.activeFilter}>
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>成绩课程表</CardTitle>
                    <CardDescription>
                      搜索、录入状态、学期、成绩类型和排序可以组合使用，最近一次视图会自动记忆。
                    </CardDescription>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    当前结果 {filteredCourses.length} / {completedCourses.length}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={viewState.searchText}
                        onChange={(event) => updateViewState({ searchText: event.target.value })}
                        placeholder="搜索课程名称、学期或原始成绩"
                        className="pl-11"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateViewState({
                          activeFilter: "pending",
                          searchText: "",
                          semesterFilter: "",
                          scoreTypeFilter: "all",
                        })
                      }
                      disabled={
                        viewState.activeFilter === "pending" &&
                        !viewState.searchText &&
                        !viewState.semesterFilter &&
                        viewState.scoreTypeFilter === "all"
                      }
                    >
                      <X data-icon="inline-start" />
                      清空筛选
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        学期
                      </span>
                      <Select
                        value={viewState.semesterFilter}
                        onChange={(event) => updateViewState({ semesterFilter: event.target.value })}
                      >
                        <option value="">全部学期</option>
                        {semesterOptions.map((semester) => (
                          <option key={semester} value={semester}>
                            {semester}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        成绩类型
                      </span>
                      <Select
                        value={viewState.scoreTypeFilter}
                        onChange={(event) =>
                          updateViewState({
                            scoreTypeFilter: normalizeScoreTypeFilter(event.target.value),
                          })
                        }
                      >
                        <option value="all">全部类型</option>
                        <option value="PERCENTAGE">百分制</option>
                        <option value="GRADE">等级制</option>
                        <option value="unset">未设置</option>
                      </Select>
                    </label>

                    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-muted-foreground">
                      过滤条件和排序会在本地保存，下次回到成绩页时可直接延续上一次的工作上下文。
                    </div>
                  </div>
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
                          active={viewState.sortKey === "name"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("name")}
                        />
                        <SortHeader
                          label="学期"
                          active={viewState.sortKey === "semester"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("semester")}
                        />
                        <SortHeader
                          label="成绩类型"
                          active={viewState.sortKey === "scoreType"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("scoreType")}
                        />
                        <SortHeader
                          label="状态"
                          active={viewState.sortKey === "status"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("status")}
                        />
                        <SortHeader
                          label="原始成绩"
                          active={viewState.sortKey === "rawScore"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("rawScore")}
                        />
                        <SortHeader
                          label="绩点"
                          active={viewState.sortKey === "gradePoint"}
                          direction={viewState.sortDirection}
                          onToggle={() => handleToggleSort("gradePoint")}
                        />
                        <TableHead className="w-[120px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCourses.map((course) => {
                        const isActive = selectedCourseId === course.id;

                        return (
                          <TableRow key={course.id} id={`score-row-${course.id}`} className={isActive ? "bg-white/[0.05]" : ""}>
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
                      onClick={() =>
                        updateViewState({
                          activeFilter: "all",
                          searchText: "",
                          semesterFilter: "",
                          scoreTypeFilter: "all",
                        })
                      }
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
