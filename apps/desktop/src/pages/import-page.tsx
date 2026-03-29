import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCheck,
  CircleAlert,
  FileDown,
  ScanSearch,
  TextSearch,
} from "lucide-react";
import { AsyncButton } from "@/components/shared/async-button";
import { PageHero } from "@/components/shared/page-hero";
import { InlineMessage } from "@/components/shared/status-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useImportMutation, useSnapshotQuery } from "@/hooks/use-snapshot-query";
import type { ImportKind, ImportWorkbenchResult } from "@/types/domain";

type ImportDrafts = Record<ImportKind, string>;

const emptyDrafts: ImportDrafts = {
  COURSE: "",
  SCORE: "",
};

export function ImportPage() {
  const snapshotQuery = useSnapshotQuery();
  const importMutation = useImportMutation();
  const [kind, setKind] = useState<ImportKind>("COURSE");
  const [drafts, setDrafts] = useState<ImportDrafts>(emptyDrafts);

  useEffect(() => {
    if (!snapshotQuery.data) {
      return;
    }

    setDrafts((current) => ({
      COURSE: current.COURSE || snapshotQuery.data.importTemplates.courseTextExample,
      SCORE: current.SCORE || snapshotQuery.data.importTemplates.scoreTextExample,
    }));
  }, [snapshotQuery.data]);

  const currentText = drafts[kind];
  const currentResult = importMutation.data?.kind === kind ? importMutation.data : undefined;
  const isPreviewing = importMutation.isPending && importMutation.variables?.apply === false;
  const isApplying = importMutation.isPending && importMutation.variables?.apply === true;

  const stats = useMemo(
    () => [
      { label: "Parsed", value: currentResult?.parsedCount ?? 0 },
      { label: "Valid", value: currentResult?.validCount ?? 0 },
      { label: "Success", value: currentResult?.successCount ?? 0 },
      { label: "Skipped", value: currentResult?.skippedCount ?? 0 },
      { label: "Failed", value: currentResult?.failureCount ?? 0 },
    ],
    [currentResult],
  );

  const setCurrentText = (value: string) => {
    setDrafts((current) => ({
      ...current,
      [kind]: value,
    }));
  };

  const loadTemplate = () => {
    if (!snapshotQuery.data) {
      return;
    }

    setCurrentText(
      kind === "COURSE"
        ? snapshotQuery.data.importTemplates.courseTextExample
        : snapshotQuery.data.importTemplates.scoreTextExample,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Batch Import"
        title="批量导入页现在直接接真实 bridge，预检和正式导入使用同一套结构化文本闭环。"
        description="支持课程导入和成绩导入切换。你可以先预检查看有效、跳过、失败明细，再确认正式导入；导入成功后会自动刷新桌面 snapshot。"
        actions={
          <>
            <Badge variant="outline">一行一条记录</Badge>
            <Badge variant="secondary">key=value; 分号分隔</Badge>
          </>
        }
      />

      <Tabs value={kind} onValueChange={(value) => setKind(value as ImportKind)}>
        <TabsList>
          <TabsTrigger value="COURSE">课程导入</TabsTrigger>
          <TabsTrigger value="SCORE">成绩导入</TabsTrigger>
        </TabsList>

        <TabsContent value="COURSE">
          <ImportWorkbench
            kind={kind}
            text={currentText}
            setText={setCurrentText}
            result={currentResult}
            isPreviewing={isPreviewing}
            isApplying={isApplying}
            stats={stats}
            onPreview={() => importMutation.mutate({ kind, text: currentText, apply: false })}
            onApply={() => importMutation.mutate({ kind, text: currentText, apply: true })}
            onLoadTemplate={loadTemplate}
            isSnapshotLoading={snapshotQuery.isLoading}
            snapshotError={
              snapshotQuery.isError
                ? snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "模板加载失败。"
                : null
            }
          />
        </TabsContent>

        <TabsContent value="SCORE">
          <ImportWorkbench
            kind={kind}
            text={currentText}
            setText={setCurrentText}
            result={currentResult}
            isPreviewing={isPreviewing}
            isApplying={isApplying}
            stats={stats}
            onPreview={() => importMutation.mutate({ kind, text: currentText, apply: false })}
            onApply={() => importMutation.mutate({ kind, text: currentText, apply: true })}
            onLoadTemplate={loadTemplate}
            isSnapshotLoading={snapshotQuery.isLoading}
            snapshotError={
              snapshotQuery.isError
                ? snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "模板加载失败。"
                : null
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ImportWorkbench({
  kind,
  text,
  setText,
  result,
  isPreviewing,
  isApplying,
  stats,
  onPreview,
  onApply,
  onLoadTemplate,
  isSnapshotLoading,
  snapshotError,
}: {
  kind: ImportKind;
  text: string;
  setText: (value: string) => void;
  result: ImportWorkbenchResult | undefined;
  isPreviewing: boolean;
  isApplying: boolean;
  stats: Array<{ label: string; value: number }>;
  onPreview: () => void;
  onApply: () => void;
  onLoadTemplate: () => void;
  isSnapshotLoading: boolean;
  snapshotError: string | null;
}) {
  const reportTone = result?.applied
    ? "success"
    : (result?.failureCount ?? 0) > 0
      ? "error"
      : result
        ? "info"
        : "neutral";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>{kind === "COURSE" ? "课程结构化文本" : "成绩结构化文本"}</CardTitle>
          <CardDescription>
            每行一条记录，字段使用分号分隔，字段内部使用 `key=value`。课程导入建议填写
            `course_name / semester / credit / status`；成绩导入建议填写
            `course_name / semester / raw_score`。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {snapshotError ? <InlineMessage tone="error">{snapshotError}</InlineMessage> : null}
          {isSnapshotLoading && !text ? (
            <InlineMessage tone="neutral">正在加载导入模板…</InlineMessage>
          ) : null}

          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
            <div className="font-medium text-foreground">格式提示</div>
            <div className="mt-2">
              {kind === "COURSE"
                ? "示例：course_name=Operating Systems;semester=2025秋;credit=4.0;status=PLANNED;score_type=PERCENTAGE"
                : "示例：course_name=Advanced Mathematics;semester=2024秋;raw_score=92"}
            </div>
          </div>

          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[360px] font-mono text-[13px]"
            placeholder="请粘贴结构化文本。"
          />

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onLoadTemplate} disabled={isPreviewing || isApplying}>
              <TextSearch data-icon="inline-start" />
              加载示例模板
            </Button>
            <AsyncButton
              variant="secondary"
              onClick={onPreview}
              disabled={isApplying || !text.trim()}
              pending={isPreviewing}
              idleLabel="先做预检"
              pendingLabel="预检中..."
              icon={<ScanSearch data-icon="inline-start" />}
            />
            <AsyncButton
              onClick={onApply}
              disabled={isPreviewing || !text.trim()}
              pending={isApplying}
              idleLabel="确认导入"
              pendingLabel="导入中..."
              icon={<CheckCheck data-icon="inline-start" />}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>导入反馈</CardTitle>
            <CardDescription>预检和正式导入都在这里展示结构化反馈。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ReportBanner tone={reportTone} result={result} isPreviewing={isPreviewing} isApplying={isApplying} />
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>导入报告</CardTitle>
            <CardDescription>展示成功、跳过、失败的详细记录和行号位置。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!result && !isPreviewing && !isApplying ? (
              <InlineMessage tone="neutral">
                还没有导入报告。先点击“先做预检”，或者直接执行导入。
              </InlineMessage>
            ) : null}

            {result?.importedIdentifiers.length ? (
              <ReportGroup
                title="成功导入"
                icon={<FileDown className="size-3.5" />}
                tone="success"
                items={result.importedIdentifiers.map((identifier) => ({
                  id: identifier,
                  title: identifier,
                  description: "已写入本地数据库，并会参与 snapshot 刷新。",
                }))}
              />
            ) : null}

            {result?.skipped.length ? (
              <ReportGroup
                title="跳过记录"
                icon={<CircleAlert className="size-3.5" />}
                tone="warning"
                items={result.skipped.map((item) => ({
                  id: `${item.lineNumber}-${item.identifier}-skip`,
                  title: `第 ${item.lineNumber} 行 · ${item.identifier}`,
                  description: item.reason,
                }))}
              />
            ) : null}

            {result?.errors.length ? (
              <ReportGroup
                title="失败明细"
                icon={<CircleAlert className="size-3.5" />}
                tone="error"
                items={result.errors.map((item) => ({
                  id: `${item.lineNumber}-${item.identifier}-error`,
                  title: `第 ${item.lineNumber} 行 · ${item.identifier}`,
                  description: item.message,
                }))}
              />
            ) : null}

            {result && !result.importedIdentifiers.length && !result.skipped.length && !result.errors.length ? (
              <InlineMessage tone="success">
                {result.applied
                  ? "本次导入没有遇到跳过或失败记录。"
                  : "预检通过，当前文本可以进入正式导入。"}
              </InlineMessage>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportBanner({
  tone,
  result,
  isPreviewing,
  isApplying,
}: {
  tone: "success" | "error" | "info" | "neutral";
  result: ImportWorkbenchResult | undefined;
  isPreviewing: boolean;
  isApplying: boolean;
}) {
  if (isPreviewing || isApplying) {
    return (
      <InlineMessage tone="neutral">
        {isApplying ? "正在执行正式导入，完成后会自动刷新 snapshot。" : "正在执行预检，请稍候。"}
      </InlineMessage>
    );
  }

  if (!result) {
    return <InlineMessage tone="neutral">预检和导入结果会在这里汇总显示。</InlineMessage>;
  }

  if (tone === "success") {
    return (
      <InlineMessage tone="success">
        导入完成，共成功写入 {result.successCount} 条记录，跳过 {result.skippedCount} 条，失败{" "}
        {result.failureCount} 条。
      </InlineMessage>
    );
  }

  if (tone === "error") {
    return (
      <InlineMessage tone="error">
        发现 {result.failureCount} 条失败记录。请根据下方报告修正后再重新预检或导入。
      </InlineMessage>
    );
  }

  return (
    <InlineMessage tone="info">
      预检完成，可用记录 {result.validCount} 条，跳过 {result.skippedCount} 条，失败{" "}
      {result.failureCount} 条。
    </InlineMessage>
  );
}

function ReportGroup({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: ReactNode;
  tone: "success" | "warning" | "error";
  items: Array<{ id: string; title: string; description: string }>;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/18 bg-emerald-400/8"
      : tone === "warning"
        ? "border-amber-400/18 bg-amber-400/8"
        : "border-red-400/18 bg-red-400/8";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {icon}
        {title}
      </div>
      {items.map((item) => (
        <div key={item.id} className={`rounded-[22px] border p-4 ${toneClass}`}>
          <div className="text-sm font-medium text-foreground">{item.title}</div>
          <div className="mt-2 text-sm leading-6 text-foreground/76">{item.description}</div>
        </div>
      ))}
    </div>
  );
}
