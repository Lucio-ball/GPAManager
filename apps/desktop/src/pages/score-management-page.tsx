import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Eraser,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { PageHero } from "@/components/shared/page-hero";
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

export function ScoreManagementPage() {
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

  const [activeFilter, setActiveFilter] = useState<ScoreFilter>("pending");
  const [searchText, setSearchText] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<ScoreFormState>({ scoreType: null, rawScore: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(searchText.trim());
  const filteredCourses = useMemo(
    () =>
      completedCourses.filter(
        (course) =>
          matchesScoreFilter(course, activeFilter) && matchesScoreSearch(course, deferredSearch),
      ),
    [activeFilter, completedCourses, deferredSearch],
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
      setFormError("请先从右侧表格中选择一门已修课程。");
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
        title="成绩页支持待录入/已录入切换筛选，录入、修改、清空都会立即回写并刷新 GPA 快照。"
        description="左侧用于真实成绩录入，右侧用于搜索、筛选和快速选课。这样既能优先处理待录入课程，也能快速回头修改已录入成绩。"
        actions={
          <>
            <Badge variant="outline">待录入 / 已录入筛选</Badge>
            <Button variant="secondary" onClick={() => void snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}>
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
            {formError ? <Notice tone="error">{formError}</Notice> : null}

            {snapshotQuery.isLoading ? (
              <Notice tone="neutral">正在加载可录入课程...</Notice>
            ) : snapshotQuery.isError ? (
              <Notice tone="error">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "成绩列表加载失败，请稍后重试。"}
              </Notice>
            ) : selectedCourse ? (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold text-foreground">{selectedCourse.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{selectedCourse.semester}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CourseStatusBadge status={selectedCourse.status} />
                  <ScoreTypeBadge scoreType={selectedCourse.scoreType} />
                  <Badge variant={selectedCourse.hasScore ? "success" : "warning"}>
                    {selectedCourse.hasScore ? "已录入" : "待录入"}
                  </Badge>
                </div>
              </div>
            ) : (
              <Notice tone="neutral">当前没有可录入的已修课程。</Notice>
            )}

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="待录入" value={pendingCount} />
              <MetricCard label="已录入" value={recordedCount} />
            </div>

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
                {isSaving ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {isSaving ? "保存中..." : selectedCourse?.hasScore ? "更新成绩" : "录入成绩"}
              </Button>

              <Button
                variant="outline"
                onClick={handleClear}
                disabled={!selectedCourse?.hasScore || clearScoreMutation.isPending}
              >
                {clearScoreMutation.isPending ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Eraser data-icon="inline-start" />
                )}
                {clearScoreMutation.isPending ? "清空中..." : "清空成绩"}
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
                      支持按待录入、已录入切换，也支持按课程名或学期搜索。操作列会明确告诉你当前是“录入”还是“编辑”。
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
                  <Button
                    variant="outline"
                    onClick={() => setSearchText("")}
                    disabled={!searchText}
                  >
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
                        <TableHead>课程</TableHead>
                        <TableHead>学期</TableHead>
                        <TableHead>成绩类型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>原始成绩</TableHead>
                        <TableHead>绩点</TableHead>
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

  return <div className={`rounded-[22px] px-4 py-3 text-sm leading-6 ${className}`}>{children}</div>;
}

function StatePanel({
  tone,
  children,
}: {
  tone: "neutral" | "error";
  children: ReactNode;
}) {
  const className =
    tone === "error"
      ? "border border-red-400/18 bg-red-400/10 text-red-100"
      : "border border-white/8 bg-white/[0.03] text-muted-foreground";

  return (
    <div className={`flex flex-col gap-4 rounded-[24px] px-5 py-6 text-sm leading-6 ${className}`}>
      {children}
    </div>
  );
}
