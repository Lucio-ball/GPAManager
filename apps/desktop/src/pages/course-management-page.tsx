import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PencilLine, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { PageHero } from "@/components/shared/page-hero";
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
    return "已修课程建议明确设置成绩类型，便于后续录入真实成绩。";
  }
  return null;
}

function filterCourses(courses: CourseRecord[], tab: CourseTab) {
  if (tab === "completed") {
    return courses.filter((course) => course.status === "COMPLETED");
  }
  if (tab === "planned") {
    return courses.filter((course) => course.status === "PLANNED");
  }
  return courses;
}

export function CourseManagementPage() {
  const { data, isFetching, refetch } = useSnapshotQuery();
  const createCourseMutation = useCreateCourseMutation();
  const updateCourseMutation = useUpdateCourseMutation();
  const deleteCourseMutation = useDeleteCourseMutation();

  const courses = data?.courses ?? [];
  const [activeTab, setActiveTab] = useState<CourseTab>("all");
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseUpsertPayload>(emptyCourseForm);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredCourses = useMemo(
    () => filterCourses(courses, activeTab),
    [activeTab, courses],
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

    if (editorMode === "edit" && selectedCourseId) {
      updateCourseMutation.mutate(
        {
          courseId: selectedCourseId,
          payload: {
            ...form,
            note: form.note?.trim() ? form.note.trim() : null,
          },
        },
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

    createCourseMutation.mutate(
      {
        ...form,
        note: form.note?.trim() ? form.note.trim() : null,
      },
      {
        onSuccess: (course) => {
          setSelectedCourseId(course.id);
          setEditorMode("edit");
          setForm(toCourseForm(course));
        },
        onError: (error) => {
          setFormError(error instanceof Error ? error.message : "新增课程失败。");
        },
      },
    );
  };

  const handleDelete = () => {
    if (!selectedCourseId) {
      return;
    }

    setFormError(null);
    deleteCourseMutation.mutate(selectedCourseId, {
      onSuccess: () => {
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
        eyebrow="Course Information Architecture"
        title="课程主数据在这里进入可写状态，新增、编辑、删除和刷新共用一套清晰工作台。"
        description="列表负责快速扫描，右侧表单负责落地操作。课程一旦变更，成绩页、规划页和首页 GPA 快照都会跟着更新。"
        actions={
          <>
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw data-icon="inline-start" className={isFetching ? "animate-spin" : ""} />
              {isFetching ? "刷新中" : "刷新列表"}
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
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>课程主列表</CardTitle>
                    <CardDescription>
                      点击任意行即可进入编辑模式。课程状态与成绩占位会直接决定后续录入和规划是否可用。
                    </CardDescription>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    当前 {filteredCourses.length} 门
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredCourses.length ? (
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCourses.map((course) => {
                        const isActive = selectedCourseId === course.id;

                        return (
                          <TableRow
                            key={course.id}
                            className={isActive ? "bg-white/[0.05]" : "cursor-pointer"}
                            onClick={() => handleSelectCourse(course)}
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
                            <TableCell>{course.rawScore ?? "未录入"}</TableCell>
                            <TableCell>{formatDecimal(course.gradePoint, 3, "--")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyHint>当前筛选下还没有课程，先在右侧工作台创建第一门课程。</EmptyHint>
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
                        ? "先补齐课程主数据，再进入成绩和规划两个闭环。"
                        : "编辑后会立即影响成绩录入入口和规划页的未修课程矩阵。"}
                    </CardDescription>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    {editorMode === "create" ? "CREATE" : "EDIT"}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {formError ? <ErrorNotice>{formError}</ErrorNotice> : null}

                {selectedCourse?.hasScore ? (
                  <InfoNotice>
                    当前课程已录入真实成绩。如果要改成“未修”，请先去成绩页清空成绩。
                  </InfoNotice>
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
                  <Button onClick={handleSubmit} disabled={isSaving}>
                    {editorMode === "create" ? (
                      <Plus data-icon="inline-start" />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    {isSaving
                      ? "保存中..."
                      : editorMode === "create"
                        ? "创建课程"
                        : "保存修改"}
                  </Button>
                  <Button variant="secondary" onClick={handleCreateNew} disabled={isSaving}>
                    <PencilLine data-icon="inline-start" />
                    新建空白表单
                  </Button>
                </div>

                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={editorMode !== "edit" || !selectedCourseId || deleteCourseMutation.isPending}
                  className="border-red-400/18 text-red-200 hover:bg-red-400/10 hover:text-red-100"
                >
                  <Trash2 data-icon="inline-start" />
                  {deleteCourseMutation.isPending ? "删除中..." : "删除当前课程"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-red-400/18 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-100">
      {children}
    </div>
  );
}

function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-amber-400/18 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
      {children}
    </div>
  );
}
