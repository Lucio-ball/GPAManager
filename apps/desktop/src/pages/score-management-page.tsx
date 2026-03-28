import { CircleAlert, PenSquare } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { CourseStatusBadge, ScoreTypeBadge } from "@/components/shared/course-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSnapshotQuery } from "@/hooks/use-snapshot-query";
import { formatDecimal } from "@/lib/format";

export function ScoreManagementPage() {
  const { data } = useSnapshotQuery();
  const courses = data?.courses ?? [];
  const missingScores = courses.filter(
    (course) => course.status === "COMPLETED" && !course.hasScore,
  );
  const recordedScores = courses.filter((course) => course.hasScore);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Score Workspace"
        title="成绩管理页把“待补录”和“已计入 GPA”拆开，录入焦点更清晰。"
        description="这里后续会接真实的 score record / clear score 命令。骨架阶段先把工作流和信息密度压到位。"
        actions={
          <>
            <Badge variant="outline">真实成绩录入</Badge>
            <Button variant="secondary">
              <PenSquare data-icon="inline-start" />
              录入成绩
            </Button>
          </>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>待补录清单</CardTitle>
            <CardDescription>把完成课程但未填真实成绩的条目单独拉出来，方便集中处理。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {missingScores.length ? (
              missingScores.map((course) => (
                <div key={course.id} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
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
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
                当前没有待补录成绩的已修课程。
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>已录入成绩</CardTitle>
            <CardDescription>保留原始成绩、类型和绩点映射，方便核对规则引擎的输出。</CardDescription>
          </CardHeader>
          <CardContent>
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
                  <TableRow key={course.id}>
                    <TableCell className="font-medium text-foreground">{course.name}</TableCell>
                    <TableCell>{course.semester}</TableCell>
                    <TableCell>
                      <ScoreTypeBadge scoreType={course.scoreType} />
                    </TableCell>
                    <TableCell>{course.rawScore}</TableCell>
                    <TableCell>{formatDecimal(course.gradePoint)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
