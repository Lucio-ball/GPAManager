import { useState } from "react";
import { Calculator, Target } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCreatePlanningTargetMutation, useSnapshotQuery } from "@/hooks/use-snapshot-query";
import { formatCredit, formatDecimal, formatScenarioLabel } from "@/lib/format";

export function PlanningPage() {
  const { data } = useSnapshotQuery();
  const planningMutation = useCreatePlanningTargetMutation();
  const [targetGpa, setTargetGpa] = useState(data?.latestPlanning?.targetGpa ?? "3.820");

  const planning = planningMutation.data ?? data?.latestPlanning ?? null;
  const plannedCourses = (data?.courses ?? []).filter((course) => course.status === "PLANNED");

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Planning Workspace"
        title="目标规划页负责把抽象目标拆成可落地的平均绩点要求，再用三种情景做结果对照。"
        description="布局上先给出目标输入和倒推结论，再展示情景卡片，最后才是未修课程承接区。这样符合真实思考顺序。"
        actions={
          <>
            <Badge variant="outline">目标 GPA 倒推</Badge>
            <Badge variant="secondary">乐观 / 中性 / 保守</Badge>
          </>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>目标输入区</CardTitle>
            <CardDescription>把创建目标动作放在左侧第一列，形成最短操作路径。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Target GPA</div>
              <Input
                value={targetGpa}
                onChange={(event) => setTargetGpa(event.target.value)}
                placeholder="例如：3.820"
              />
            </div>
            <Button onClick={() => planningMutation.mutate(targetGpa)} disabled={planningMutation.isPending}>
              <Calculator data-icon="inline-start" />
              重新倒推
            </Button>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-foreground/76">
              当前结果基于已修学分 {formatCredit(planning?.basedOnCompletedCreditSum)} 与当前 GPA{" "}
              {formatDecimal(planning?.basedOnCurrentGpa)} 计算。
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>规划结论</CardTitle>
            <CardDescription>把 required GPA 与自然语言解释直接置顶，避免用户自己换算。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/8 bg-gradient-to-br from-accent/14 to-transparent p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                <Target className="size-3.5" />
                Required Future Average
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-foreground">
                {formatDecimal(planning?.requiredFutureAverageGp)}
              </div>
              <div className="mt-4 text-sm leading-7 text-foreground/76">
                {planning?.requiredScoreText ?? "创建目标后，这里会显示未来课程平均成绩要求。"}
              </div>
            </div>
            <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Feasibility
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {planning?.feasible ? "可达成" : "待确认"}
              </div>
              <div className="mt-4 text-sm leading-7 text-foreground/76">
                {planning?.infeasibleReason ?? "当前规划在现有未修学分范围内可继续推演。"}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {planning?.scenarios.map((scenario) => (
          <Card key={scenario.scenarioId}>
            <CardHeader>
              <CardTitle>{formatScenarioLabel(scenario.scenarioType)}</CardTitle>
              <CardDescription>覆盖 {scenario.expectationCount} 门未修课程</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="text-4xl font-semibold tracking-[-0.06em] text-foreground">
                {formatDecimal(scenario.simulatedFinalGpa)}
              </div>
              <div className="text-sm leading-6 text-muted-foreground">
                已覆盖 {formatCredit(scenario.coveredPlannedCredit)} 学分，是否满覆盖：
                {scenario.isFullCoverage ? " 是" : " 否"}。
              </div>
            </CardContent>
          </Card>
        )) ?? null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>未修课程承接区</CardTitle>
          <CardDescription>后续接入 scenario expectation 录入时，直接在这里承接，不需要重组页面。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>课程</TableHead>
                <TableHead>学期</TableHead>
                <TableHead>学分</TableHead>
                <TableHead>建议角色</TableHead>
                <TableHead>计划成绩占位</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedCourses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium text-foreground">{course.name}</TableCell>
                  <TableCell>{course.semester}</TableCell>
                  <TableCell>{formatCredit(course.credit)}</TableCell>
                  <TableCell>{course.note ?? "常规课程"}</TableCell>
                  <TableCell className="text-muted-foreground">等待接入情景成绩输入</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
