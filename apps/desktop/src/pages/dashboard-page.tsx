import type { ReactNode } from "react";
import {
  ArrowRight,
  BookCopy,
  Compass,
  Flag,
  GraduationCap,
  Target,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CourseStatusBadge } from "@/components/shared/course-status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHero } from "@/components/shared/page-hero";
import { InlineMessage, StatePanel } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSnapshotQuery } from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal, formatScenarioLabel } from "@/lib/format";

function formatGapValue(target: string | null | undefined, current: string | null | undefined) {
  if (!target || !current) {
    return "--";
  }

  const delta = Number(target) - Number(current);
  if (!Number.isFinite(delta)) {
    return "--";
  }

  return `${delta >= 0 ? "" : "-"}${Math.abs(delta).toFixed(3)}`;
}

function describeGap(target: string | null | undefined, current: string | null | undefined) {
  if (!target) {
    return "还没有目标 GPA，首页暂时只展示当前基线。";
  }

  if (!current) {
    return "目标已建立，但当前还没有已计入 GPA 的成绩记录。";
  }

  const delta = Number(target) - Number(current);
  if (delta > 0) {
    return `距离最新目标还差 ${delta.toFixed(3)}，后续课程仍有提分空间。`;
  }
  if (delta < 0) {
    return `当前 GPA 已领先目标 ${Math.abs(delta).toFixed(3)}。`;
  }
  return "当前 GPA 与目标完全对齐。";
}

function getScenarioBadgeVariant(scenarioType: string): "success" | "warning" | "secondary" {
  if (scenarioType === "OPTIMISTIC") {
    return "success";
  }
  if (scenarioType === "CONSERVATIVE") {
    return "warning";
  }
  return "secondary";
}

export function DashboardPage() {
  const snapshotQuery = useSnapshotQuery();

  if (snapshotQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow="Dashboard / Desktop Control Center"
          title="正在加载本地学业快照。"
          description="首页会直接展示当前 GPA、目标差距、剩余平均要求和三情景摘要。"
        />
        <StatePanel tone="neutral">
          <div>
            <div className="font-medium text-foreground">正在连接桌面数据链路</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              React 正在等待 Tauri、Python bridge 和 SQLite 返回最新 snapshot。
            </div>
          </div>
        </StatePanel>
      </div>
    );
  }

  if (snapshotQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          eyebrow="Dashboard / Desktop Control Center"
          title="首页快照加载失败。"
          description="当前环境不会在 Tauri 里回退到 mock，请直接检查桌面桥接与本地数据库。"
        />
        <StatePanel tone="error">
          <div>
            <div className="font-medium text-foreground">Snapshot 获取失败</div>
            <div className="mt-1 text-sm leading-6 text-foreground/78">
              {snapshotQuery.error instanceof Error
                ? snapshotQuery.error.message
                : "请检查 bridge、Python 环境或数据库路径。"}
            </div>
          </div>
          <Button variant="secondary" onClick={() => void snapshotQuery.refetch()}>
            重新加载
          </Button>
        </StatePanel>
      </div>
    );
  }

  const data = snapshotQuery.data!;
  const summary = data.summary;
  const courses = data.courses;
  const latestPlanning = data.latestPlanning;
  const completedCourses = courses.filter((course) => course.status === "COMPLETED");
  const plannedCourses = courses.filter((course) => course.status === "PLANNED");
  const missingScoreCount = completedCourses.filter((course) => !course.hasScore).length;
  const plannedCreditSum = plannedCourses.reduce((sum, course) => sum + Number(course.credit), 0);
  const latestCourses = [...courses]
    .sort((left, right) => right.semester.localeCompare(left.semester, "zh-Hans-CN"))
    .slice(0, 5);
  const incompleteScenarios = latestPlanning?.scenarios.filter((scenario) => !scenario.isFullCoverage) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Dashboard / Desktop Control Center"
        title="当前 GPA、目标差距和剩余课程要求应该在第一屏就能看清。"
        description="首页现在只保留决策最需要的数值和摘要：当前基线、目标压力、三情景区间，以及下一步应该先去哪一页补数据。"
        actions={
          <>
            <Badge variant="outline">Offline SQLite</Badge>
            <Badge variant="secondary">Desktop Bridge</Badge>
            <Button asChild>
              <Link to="/planning">
                进入目标规划
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      {!courses.length ? (
        <Card className="overflow-hidden">
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
                Empty Workspace
              </div>
              <div className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                先补第一批课程，首页才会开始真正工作。
              </div>
              <div className="mt-4 max-w-2xl text-sm leading-7 text-foreground/74">
                当前还没有课程数据，因此 GPA、目标差距和三情景都无法建立。可以从课程页手动创建，或者去导入页粘贴结构化文本。
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/courses">
                    <GraduationCap data-icon="inline-start" />
                    创建第一门课程
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link to="/import">
                    <BookCopy data-icon="inline-start" />
                    去批量导入
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-3">
              <MetricCard
                label="当前 GPA"
                value="--"
                description="还没有可计入 GPA 的成绩。"
                eyebrow="Current GPA"
                trailing={<Target className="size-5 text-accent" />}
              />
              <MetricCard
                label="课程总数"
                value="0"
                description="先建立课程主数据，其他页面才会连起来。"
                eyebrow="Catalog"
                accent="warning"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.28fr)_420px]">
            <Card className="relative overflow-hidden">
              <div className="absolute inset-y-0 right-0 hidden w-[38%] bg-[radial-gradient(circle_at_top,rgba(111,219,255,0.2),transparent_56%)] lg:block" />
              <CardContent className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
                    Current GPA
                  </div>
                  <div className="mt-4 text-6xl font-semibold tracking-[-0.08em] text-foreground">
                    {formatDecimal(summary.currentGpa)}
                  </div>
                  <div className="mt-4 max-w-2xl text-sm leading-7 text-foreground/76">
                    已计入 {summary.countedCourseCount} 门课程，共 {formatCredit(summary.countedCreditSum)} 学分，
                    质量点合计 {formatDecimal(summary.qualityPointSum)}。
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Badge variant="secondary">已修 {completedCourses.length}</Badge>
                    <Badge variant="secondary">未修 {plannedCourses.length}</Badge>
                    <Badge variant={missingScoreCount > 0 ? "warning" : "success"}>
                      待录入成绩 {missingScoreCount}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3">
                  <SnapshotLine
                    label="已计入学分"
                    value={formatCredit(summary.countedCreditSum)}
                    hint="参与当前 GPA 的真实学分"
                    icon={<TrendingUp className="size-4" />}
                  />
                  <SnapshotLine
                    label="已计入课程数"
                    value={`${summary.countedCourseCount}`}
                    hint="已有成绩并纳入统计"
                    icon={<GraduationCap className="size-4" />}
                  />
                  <SnapshotLine
                    label="未修学分"
                    value={formatCredit(plannedCreditSum)}
                    hint="仍可用于目标规划推演"
                    icon={<Compass className="size-4" />}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader>
                <CardTitle>目标规划信号</CardTitle>
                <CardDescription>首页不要求你编辑规划，但必须先告诉你当前是否有目标、差距多大、还剩多少空间。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {latestPlanning ? (
                  <>
                    <InlineMessage tone={incompleteScenarios.length ? "warning" : "info"}>
                      {incompleteScenarios.length
                        ? `当前有 ${incompleteScenarios.length} 个情景还未覆盖全部未修课程。`
                        : "三情景已形成完整覆盖，可以直接把首页当作总控入口。"}
                    </InlineMessage>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <MetricCard
                        label="目标 GPA 差距"
                        value={formatGapValue(latestPlanning.targetGpa, summary.currentGpa)}
                        description={describeGap(latestPlanning.targetGpa, summary.currentGpa)}
                        eyebrow="Gap To Target"
                        trailing={<Target className="size-5 text-accent" />}
                      />
                      <MetricCard
                        label="剩余课程平均要求"
                        value={formatDecimal(latestPlanning.requiredFutureAverageGp)}
                        description={latestPlanning.requiredScoreText}
                        eyebrow="Future Average"
                        accent="warning"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col justify-between gap-4 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-5">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        No Target Yet
                      </div>
                      <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                        还没有目标 GPA
                      </div>
                      <div className="mt-3 text-sm leading-7 text-muted-foreground">
                        当前首页会继续显示 GPA 基线，但目标差距、剩余平均要求和情景摘要要在规划页创建目标后才会出现。
                      </div>
                    </div>
                    <Button asChild>
                      <Link to="/planning">
                        创建目标 GPA
                        <ArrowRight data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="已计入学分"
              value={formatCredit(summary.countedCreditSum)}
              description="这部分学分决定当前 GPA 的稳定程度。"
              eyebrow="Counted Credits"
            />
            <MetricCard
              label="已计入课程数"
              value={`${summary.countedCourseCount}`}
              description="只有已修且有真实成绩的课程会被纳入。"
              eyebrow="Counted Courses"
              accent="success"
            />
            <MetricCard
              label="目标 GPA 差距"
              value={formatGapValue(latestPlanning?.targetGpa, summary.currentGpa)}
              description={describeGap(latestPlanning?.targetGpa, summary.currentGpa)}
              eyebrow="Gap"
              accent="warning"
            />
            <MetricCard
              label="剩余课程平均要求"
              value={formatDecimal(latestPlanning?.requiredFutureAverageGp)}
              description={
                latestPlanning?.requiredScoreText ?? "建立目标后，这里会显示对剩余课程的平均要求。"
              }
              eyebrow="Projection"
              trailing={<Flag className="size-5 text-accent" />}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
            <Card>
              <CardHeader>
                <CardTitle>三情景概览</CardTitle>
                <CardDescription>乐观、中性、保守三种规划结果在首页直接对比，避免频繁切页核对。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {latestPlanning?.scenarios.length ? (
                  latestPlanning.scenarios.map((scenario) => (
                    <div
                      key={scenario.scenarioId}
                      className="grid gap-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-4 lg:grid-cols-[160px_minmax(0,1fr)_110px] lg:items-center"
                    >
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {formatScenarioLabel(scenario.scenarioType)}
                        </div>
                        <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                          {formatDecimal(scenario.simulatedFinalGpa)}
                        </div>
                      </div>
                      <div className="text-sm leading-7 text-foreground/76">
                        已覆盖 {formatCredit(scenario.coveredPlannedCredit)} 学分，未来平均绩点要求{" "}
                        {formatDecimal(scenario.requiredFutureAverageGp)}。
                      </div>
                      <div className="flex justify-start lg:justify-end">
                        <Badge variant={getScenarioBadgeVariant(scenario.scenarioType)}>
                          覆盖 {scenario.expectationCount} 门
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <InlineMessage tone="neutral">
                    还没有三情景结果。先去目标规划页创建目标 GPA，再保存未修课程的预期成绩。
                  </InlineMessage>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>最近规划摘要</CardTitle>
                <CardDescription>这张卡片替代“最近导入结果”，直接告诉你最近一次规划是否完整、是否可达。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {latestPlanning ? (
                  <>
                    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        Latest Target
                      </div>
                      <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
                        {formatDecimal(latestPlanning.targetGpa)}
                      </div>
                      <div className="mt-3 text-sm leading-7 text-foreground/76">
                        {latestPlanning.requiredScoreText}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <MetricCard
                        label="可达性"
                        value={
                          latestPlanning.feasible === null
                            ? "待计算"
                            : latestPlanning.feasible
                              ? "可达"
                              : "不可达"
                        }
                        description={latestPlanning.infeasibleReason ?? "当前目标仍可继续推进。"}
                        eyebrow="Feasibility"
                        accent={latestPlanning.feasible ? "success" : "warning"}
                      />
                      <MetricCard
                        label="未修学分"
                        value={formatCredit(latestPlanning.plannedCreditSum)}
                        description="这是当前规划正在覆盖的未修课程总学分。"
                        eyebrow="Planned Credits"
                      />
                    </div>
                  </>
                ) : (
                  <InlineMessage tone="neutral">
                    还没有最近规划摘要。首页会在你创建目标后自动接管这部分内容。
                  </InlineMessage>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
            <Card>
              <CardHeader>
                <CardTitle>课程快照</CardTitle>
                <CardDescription>首页保留只读快照，服务“看现在”的判断，不在这里承载复杂编辑。</CardDescription>
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
                    {latestCourses.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{course.name}</div>
                        </TableCell>
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
                <CardTitle>下一步建议</CardTitle>
                <CardDescription>首页应该把人往正确的下一步推，而不是只做展示。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {missingScoreCount > 0 ? (
                  <Suggestion
                    title={`还有 ${missingScoreCount} 门已修课程未录入成绩`}
                    description="优先去成绩页补录，当前 GPA 和规划基线都会更可靠。"
                    to="/scores"
                    buttonLabel="去录入成绩"
                  />
                ) : null}

                {!latestPlanning ? (
                  <Suggestion
                    title="还没有目标 GPA"
                    description="先建立目标后，首页才会显示差距、剩余平均要求和三情景摘要。"
                    to="/planning"
                    buttonLabel="去创建目标"
                  />
                ) : null}

                {plannedCourses.length === 0 ? (
                  <Suggestion
                    title="当前没有未修课程"
                    description="如果学期还没结束，可以先去课程页补齐后续课程，再做规划。"
                    to="/courses"
                    buttonLabel="去维护课程"
                  />
                ) : null}

                {!missingScoreCount && latestPlanning && plannedCourses.length > 0 ? (
                  <InlineMessage tone="success">
                    当前首页信息已经比较完整，可以直接演示从首页进入课程、成绩和规划三条主链路。
                  </InlineMessage>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function SnapshotLine({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/15 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-white/[0.05] text-foreground/84">
            {icon}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        </div>
        <div className="text-xl font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function Suggestion({
  title,
  description,
  to,
  buttonLabel,
}: {
  title: string;
  description: string;
  to: string;
  buttonLabel: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
      <Button variant="secondary" asChild className="mt-4">
        <Link to={to}>
          {buttonLabel}
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
