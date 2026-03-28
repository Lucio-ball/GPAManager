import type { CourseRecord } from "@/types/domain";
import { Plus, SlidersHorizontal } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSnapshotQuery } from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal } from "@/lib/format";

export function CourseManagementPage() {
  const { data } = useSnapshotQuery();
  const courses = data?.courses ?? [];
  const completedCourses = courses.filter((course) => course.status === "COMPLETED");
  const plannedCourses = courses.filter((course) => course.status === "PLANNED");

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Course Information Architecture"
        title="课程管理页围绕课程主数据展开，把学期、学分、状态和成绩占位清楚分层。"
        description="首版保持列表驱动，右侧保留表单工作区位置。这样后续接入新增、编辑、删除时，不需要重做结构。"
        actions={
          <>
            <Button variant="secondary">
              <SlidersHorizontal data-icon="inline-start" />
              筛选器
            </Button>
            <Button>
              <Plus data-icon="inline-start" />
              新增课程
            </Button>
          </>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">全部课程 {courses.length}</TabsTrigger>
          <TabsTrigger value="completed">已修 {completedCourses.length}</TabsTrigger>
          <TabsTrigger value="planned">未修 {plannedCourses.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <CourseWorkspace courses={courses} />
        </TabsContent>
        <TabsContent value="completed">
          <CourseWorkspace courses={completedCourses} />
        </TabsContent>
        <TabsContent value="planned">
          <CourseWorkspace courses={plannedCourses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CourseWorkspace({ courses }: { courses: CourseRecord[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
      <Card>
        <CardHeader>
          <CardTitle>课程主列表</CardTitle>
          <CardDescription>
            以学期为排序主轴，课程状态和成绩占位同时可见，适合作为后续编辑、删除、录入跳转的统一入口。
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{course.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{course.note ?? "无备注"}</div>
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
                  <TableCell>{formatDecimal(course.gradePoint, 3, "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>编辑工作区骨架</CardTitle>
          <CardDescription>
            首版先固定交互位置，后续直接接入课程新增与编辑表单，不再改页面结构。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PlaceholderField label="课程名称" value="例如：Operating Systems" />
          <PlaceholderField label="学期" value="例如：2025秋" />
          <PlaceholderField label="学分" value="例如：4.0" />
          <PlaceholderField label="状态" value="COMPLETED / PLANNED" />
          <PlaceholderField label="成绩类型" value="PERCENTAGE / GRADE" />
          <PlaceholderField label="备注" value="可选补充信息" tall />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary">保存课程</Button>
            <Button variant="outline">删除课程</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlaceholderField({
  label,
  value,
  tall = false,
}: {
  label: string;
  value: string;
  tall?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div
        className={
          tall
            ? "min-h-28 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground"
            : "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground"
        }
      >
        {value}
      </div>
    </div>
  );
}
