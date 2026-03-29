import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AsyncButton } from "@/components/shared/async-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { PageHero } from "@/components/shared/page-hero";
import { InlineMessage, StatePanel } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCourseMutation,
  useDeleteCourseMutation,
  useSnapshotQuery,
  useUpdateCourseMutation,
} from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal } from "@/lib/format";
import type { CourseRecord, CourseStatus, CourseUpsertPayload, ScoreType } from "@/types/domain";

type CourseTab = "all" | "completed" | "planned";
type EditorMode = "create" | "edit";

const emptyCourseForm: CourseUpsertPayload = {
  name: "",
  semester: "",
  credit: "",
  status: "PLANNED",
  scoreType: "PERCENTAGE",
  note: "",
};

function toCourseForm(course: CourseRecord): CourseUpsertPayload {
  return {
    name: course.name,
    semester: course.semester,
    credit: course.credit,
    status: course.status,
    scoreType: course.scoreType,
    note: course.note ?? "",
  };
}

function validateCourseForm(form: CourseUpsertPayload) {
  if (!form.name.trim()) {
    return "课程名称不能为空。";
  }

  if (!/^\d{4}[春夏秋冬]$/u.test(form.semester.trim())) {
    return "学期格式需为 YYYY+春/夏/秋/冬，例如 2026春。";
  }

  const credit = Number(form.credit);
  if (!Number.isFinite(credit) || credit <= 0) {
    return "学分必须是大于 0 的数字。";
  }

  if (form.status === "COMPLETED" && form.scoreType === null) {
    return "已修课程建议明确设置成绩类型，方便后续成绩录入。";
  }

  return null;
}

function matchesCourseTab(course: CourseRecord, tab: CourseTab) {
  if (tab === "completed") {
    return course.status === "COMPLETED";
  }

  if (tab === "planned") {
    return course.status === "PLANNED";
  }

  return true;
}

function matchesCourseSearch(course: CourseRecord, search: string) {
  if (!search) {
    return true;
  }

  const normalized = search.toLowerCase();
  return [course.name, course.semester, course.note ?? ""].some((value) =>
    value.toLowerCase().includes(normalized),
  );
}

export function CourseManagementPage() {
  const snapshotQuery = useSnapshotQuery();
  const createCourseMutation = useCreateCourseMutation();
  const updateCourseMutation = useUpdateCourseMutation();
  const deleteCourseMutation = useDeleteCourseMutation();

  const courses = snapshotQuery.data?.courses ?? [];
  const [activeTab, setActiveTab] = useState<CourseTab>("all");
  const [searchText, setSearchText] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseUpsertPayload>(emptyCourseForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deferredSearch = useDeferredValue(searchText.trim());
  const filteredCourses = useMemo(
    () =>
      courses.filter(
        (course) => matchesCourseTab(course, activeTab) && matchesCourseSearch(course, deferredSearch),
      ),
    [activeTab, courses, deferredSearch],
  );
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const isSaving = createCourseMutation.isPending || updateCourseMutation.isPending;

  useEffect(() => {
    if (selectedCourseId && !courses.some((course) => course.id === selectedCourseId)) {
      handleCreateNew();
    }
  }, [courses, selectedCourseId]);

  const handleCreateNew = () => {
    setEditorMode("create");
    setSelectedCourseId(null);
    setForm(emptyCourseForm);
    setFormError(null);
  };

  const handleSelectCourse = (course: CourseRecord) => {
    setEditorMode("edit");
    setSelectedCourseId(course.id);
    setForm(toCourseForm(course));
    setFormError(null);
  };

  const handleSubmit = () => {
    const validationError = validateCourseForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    const payload: CourseUpsertPayload = {
      ...form,
      note: form.note?.trim() ? form.note.trim() : null,
    };

    if (editorMode === "edit" && selectedCourseId) {
      updateCourseMutation.mutate(
        { courseId: selectedCourseId, payload },
        {
          onSuccess: (course) => {
            setSelectedCourseId(course.id);
            setEditorMode("edit");
            setForm(toCourseForm(course));
          },
          onError: (error) => {
            setFormError(error instanceof Error ? error.message : "编辑课程失败。");
          },
        },
      );
      return;
    }

    createCourseMutation.mutate(payload, {
      onSuccess: (course) => {
        setSelectedCourseId(course.id);
        setEditorMode("edit");
        setForm(toCourseForm(course));
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "新建课程失败。");
      },
    });
  };

  const handleDelete = () => {
    if (!selectedCourseId) {
      return;
    }

    setFormError(null);
    deleteCourseMutation.mutate(selectedCourseId, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        handleCreateNew();
      },
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : "删除课程失败。");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Course Workspace"
        title="课程主数据已经进入完整编辑态，支持搜索、状态筛选、增删改和快照同步刷新。"
        description="列表区域现在强调“筛选和操作”，编辑区域强调“当前选中课程”和表单保存。课程一旦变更，成绩页、规划页和首页 summary 都会联动刷新。"
        actions={
          <>
            <Badge variant="outline">搜索 + 已修/未修筛选</Badge>
            <Button variant="secondary" onClick={() => void snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}>
              <RefreshCw data-icon="inline-start" className={snapshotQuery.isFetching ? "animate-spin" : ""} />
              {snapshotQuery.isFetching ? "刷新中..." : "刷新列表"}
            </Button>
            <Button onClick={handleCreateNew}>
              <Plus data-icon="inline-start" />
              新增课程
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CourseTab)}>
        <TabsList>
          <TabsTrigger value="all">全部课程 {courses.length}</TabsTrigger>
          <TabsTrigger value="completed">
            已修 {courses.filter((course) => course.status === "COMPLETED").length}
          </TabsTrigger>
          <TabsTrigger value="planned">
            未修 {courses.filter((course) => course.status === "PLANNED").length}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>课程列表</CardTitle>
                    <CardDescription>
                      支持按名称、学期和备注搜索。右侧操作列可以直接进入编辑，避免只靠整行点击。
                    </CardDescription>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    当前结果 {filteredCourses.length} / {courses.length}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="搜索课程名称、学期或备注"
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
                    正在加载课程列表...
                  </StatePanel>
                ) : snapshotQuery.isError ? (
                  <StatePanel tone="error">
                    <div>
                      <div className="font-medium text-foreground">课程列表加载失败</div>
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
                ) : !courses.length ? (
                  <StatePanel tone="neutral">
                    <div>
                      <div className="font-medium text-foreground">还没有课程数据</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        可以先在右侧创建课程，或者去批量导入页导入课程清单。
                      </div>
                    </div>
                    <Button onClick={handleCreateNew}>
                      <Plus data-icon="inline-start" />
                      创建第一门课程
                    </Button>
                  </StatePanel>
                ) : filteredCourses.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>课程</TableHead>
                        <TableHead>学期</TableHead>
                        <TableHead>学分</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>成绩类型</TableHead>
                        <TableHead>原始成绩</TableHead>
                        <TableHead>绩点</TableHead>
                        <TableHead className="w-[120px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCourses.map((course) => {
                        const isActive = selectedCourseId === course.id;

                        return (
                          <TableRow
                            key={course.id}
                            className={isActive ? "bg-white/[0.05]" : ""}
                          >
                            <TableCell>
                              <div className="font-medium text-foreground">{course.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {course.note ?? "暂无备注"}
                              </div>
                            </TableCell>
                            <TableCell>{course.semester}</TableCell>
                            <TableCell>{formatCredit(course.credit)}</TableCell>
                            <TableCell>
                              <CourseStatusBadge status={course.status} />
                            </TableCell>
                            <TableCell>
                              <ScoreTypeBadge scoreType={course.scoreType} />
                            </TableCell>
                            <TableCell>{course.rawScore ?? "--"}</TableCell>
                            <TableCell>{formatDecimal(course.gradePoint, 3, "--")}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={isActive ? "default" : "secondary"}
                                onClick={() => handleSelectCourse(course)}
                              >
                                编辑
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
                        可以清空搜索词，或者切换到其他状态筛选。
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearchText("");
                        setActiveTab("all");
                      }}
                    >
                      清空筛选
                    </Button>
                  </StatePanel>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{editorMode === "create" ? "新增课程" : "编辑课程"}</CardTitle>
                    <CardDescription>
                      {editorMode === "create"
                        ? "先补齐课程主数据，再进入成绩和规划闭环。"
                        : "保存后会立即影响成绩录入、规划计算和首页快照。"}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{editorMode === "create" ? "CREATE" : "EDIT"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {formError ? <InlineMessage tone="error">{formError}</InlineMessage> : null}

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
                  <InlineMessage tone="neutral">
                    当前是新建模式，保存后会自动进入该课程的编辑态。
                  </InlineMessage>
                )}

                {selectedCourse?.hasScore ? (
                  <InlineMessage tone="warning">
                    当前课程已经录入真实成绩。如果要改回“未修”，请先到成绩页清空成绩。
                  </InlineMessage>
                ) : null}

                <Field label="课程名称">
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="例如：Operating Systems"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="学期">
                    <Input
                      value={form.semester}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, semester: event.target.value }))
                      }
                      placeholder="例如：2026春"
                    />
                  </Field>

                  <Field label="学分">
                    <Input
                      value={form.credit}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, credit: event.target.value }))
                      }
                      placeholder="例如：3.0"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="课程状态">
                    <Select
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          status: event.target.value as CourseStatus,
                        }))
                      }
                    >
                      <option value="PLANNED">未修</option>
                      <option value="COMPLETED">已修</option>
                    </Select>
                  </Field>

                  <Field label="成绩类型">
                    <Select
                      value={form.scoreType ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          scoreType: (event.target.value || null) as ScoreType | null,
                        }))
                      }
                    >
                      <option value="">未设置</option>
                      <option value="PERCENTAGE">百分制</option>
                      <option value="GRADE">等级制</option>
                    </Select>
                  </Field>
                </div>

                <Field label="备注">
                  <Textarea
                    className="min-h-28"
                    value={form.note ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="可填写课程定位、重点提醒或规划用途"
                  />
                </Field>

                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <AsyncButton
                    onClick={handleSubmit}
                    pending={isSaving}
                    idleLabel={editorMode === "create" ? "创建课程" : "保存修改"}
                    pendingLabel="保存中..."
                    icon={editorMode === "create" ? <Plus data-icon="inline-start" /> : <PencilLine data-icon="inline-start" />}
                  />

                  <Button variant="secondary" onClick={handleCreateNew} disabled={isSaving}>
                    <PencilLine data-icon="inline-start" />
                    新建空白表单
                  </Button>
                </div>

                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={editorMode !== "edit" || !selectedCourseId || deleteCourseMutation.isPending}
                >
                  <Trash2 data-icon="inline-start" />
                  删除当前课程
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="确认删除当前课程？"
        description="课程删除后，相关成绩、GPA 计算和规划结果都会一起受影响。这一步不会自动回退。"
        confirmLabel="确认删除"
        pendingLabel="删除中..."
        onConfirm={handleDelete}
        pending={deleteCourseMutation.isPending}
        tone="danger"
      />
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
