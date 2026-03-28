import type { ReactNode } from "react";
import { ArrowRight, BookCopy, Flag, GraduationCap, Target } from "lucide-react";
import { CourseStatusBadge } from "@/components/shared/course-status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHero } from "@/components/shared/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSnapshotQuery } from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal, formatScenarioLabel } from "@/lib/format";

export function DashboardPage() {
  const { data } = useSnapshotQuery();
  const summary = data?.summary;
  const courses = data?.courses ?? [];
  const latestPlanning = data?.latestPlanning;
  const completedCount = courses.filter((course) => course.status === "COMPLETED").length;
  const plannedCount = courses.filter((course) => course.status === "PLANNED").length;
  const missingScoreCount = courses.filter(
    (course) => course.status === "COMPLETED" && !course.hasScore,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Dashboard / Offline GPA Workspace"
        title="把当前 GPA、剩余提分空间和规划状态放在第一屏，成为真正可操作的本地学业仪表盘。"
        description="首页不是堆卡片，而是让你先看到最关键的数，再下探课程、成绩、规划和导入。深色界面强调数值层级与扫描效率，适合长时间离线使用。"
        actions={
          <>
            <Badge variant="outline">单用户</Badge>
            <Badge variant="secondary">本地 SQLite</Badge>
            <Button>
              进入目标规划
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_top,rgba(111,219,255,0.22),transparent_56%)] lg:block" />
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_220px] lg:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
                Current GPA
              </div>
              <div className="mt-4 text-6xl font-semibold tracking-[-0.08em] text-foreground">
                {formatDecimal(summary?.currentGpa)}
              </div>
              <div className="mt-4 max-w-xl text-sm leading-7 text-foreground/74">
                已纳入 GPA 课程 {summary?.countedCourseCount ?? 0} 门，共 {formatCredit(summary?.countedCreditSum)}
                学分，当前质量点合计 {formatDecimal(summary?.qualityPointSum)}。
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-[28px] border border-white/8 bg-white/[0.04] p-4">
              <SnapshotLine label="已修课程" value={`${completedCount}`} icon={<GraduationCap className="size-4" />} />
              <SnapshotLine label="未修课程" value={`${plannedCount}`} icon={<BookCopy className="size-4" />} />
              <SnapshotLine label="待补成绩" value={`${missingScoreCount}`} icon={<Flag className="size-4" />} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            label="目标 GPA 差距"
            value={
              latestPlanning?.targetGpa && summary?.currentGpa
                ? formatDecimal(Number(latestPlanning.targetGpa) - Number(summary.currentGpa), 3)
                : "--"
            }
            description="从首页直观看到当前 GPA 与最新目标之间的差值，不需要进入规划页再计算。"
            eyebrow="Gap"
            trailing={<Target className="size-5 text-accent" />}
          />
          <MetricCard
            label="未来平均绩点要求"
            value={formatDecimal(latestPlanning?.requiredFutureAverageGp)}
            description={latestPlanning?.requiredScoreText ?? "尚未建立目标规划，先创建目标 GPA 才会显示倒推结果。"}
            eyebrow="Projection"
            accent="warning"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          label="课程覆盖"
          value={`${completedCount + plannedCount}`}
          description="课程主数据是整个系统的地基。所有成绩、规划与导入反馈都从这里挂接。"
          eyebrow="Catalog"
          accent="success"
        />
        <MetricCard
          label="已修学分"
          value={formatCredit(summary?.countedCreditSum)}
          description="用于判断当前 GPA 的稳定性，也能快速看出剩余课程还有多少可操作空间。"
          eyebrow="Completed Credits"
        />
        <MetricCard
          label="未修学分"
          value={formatCredit(
            courses
              .filter((course) => course.status === "PLANNED")
              .reduce((sum, course) => sum + Number(course.credit), 0),
          )}
          description="未修学分越多，目标规划可调空间越大，也更适合做三情景对比。"
          eyebrow="Planned Credits"
          accent="warning"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>课程快照</CardTitle>
            <CardDescription>首页保留高频扫描表，不做复杂操作，只服务“看现在”的判断。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>课程</TableHead>
                  <TableHead>学期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>学分</TableHead>
                  <TableHead>成绩</TableHead>
                  <TableHead>绩点</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.slice(0, 6).map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium text-foreground">{course.name}</TableCell>
                    <TableCell>{course.semester}</TableCell>
                    <TableCell>
                      <CourseStatusBadge status={course.status} />
                    </TableCell>
                    <TableCell>{formatCredit(course.credit)}</TableCell>
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
            <CardTitle>三情景预览</CardTitle>
            <CardDescription>在首页先看到规划结果强弱区间，避免来回切页。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {latestPlanning?.scenarios.map((scenario) => (
              <div
                key={scenario.scenarioId}
                className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {formatScenarioLabel(scenario.scenarioType)}
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {formatDecimal(scenario.simulatedFinalGpa)}
                    </div>
                  </div>
                  <Badge variant={scenario.scenarioType === "CONSERVATIVE" ? "warning" : "secondary"}>
                    覆盖 {scenario.expectationCount} 门
                  </Badge>
                </div>
                <div className="mt-3 text-sm leading-6 text-muted-foreground">
                  已覆盖 {formatCredit(scenario.coveredPlannedCredit)} 学分，未来平均绩点要求{" "}
                  {formatDecimal(scenario.requiredFutureAverageGp)}。
                </div>
              </div>
            )) ?? (
              <div className="rounded-[24px] border border-dashed border-white/10 p-5 text-sm text-muted-foreground">
                还没有建立目标规划，进入“目标规划页”创建目标 GPA。
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SnapshotLine({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="flex size-8 items-center justify-center rounded-xl bg-white/[0.05] text-foreground/82">
          {icon}
        </div>
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
