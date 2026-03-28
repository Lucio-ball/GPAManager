import { useEffect, useMemo, useState } from "react";
import { CheckCheck, FileDown, ScanSearch } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useImportMutation, useSnapshotQuery } from "@/hooks/use-snapshot-query";
import type { ImportKind, ImportWorkbenchResult } from "@/types/domain";

export function ImportPage() {
  const { data } = useSnapshotQuery();
  const importMutation = useImportMutation();
  const [kind, setKind] = useState<ImportKind>("COURSE");
  const [text, setText] = useState("");

  useEffect(() => {
    const nextText =
      kind === "COURSE"
        ? data?.importTemplates.courseTextExample
        : data?.importTemplates.scoreTextExample;
    if (nextText) {
      setText(nextText);
    }
  }, [data?.importTemplates.courseTextExample, data?.importTemplates.scoreTextExample, kind]);

  const currentResult = importMutation.data;
  const stats = useMemo(
    () => [
      { label: "Parsed", value: `${currentResult?.parsedCount ?? 0}` },
      { label: "Valid", value: `${currentResult?.validCount ?? 0}` },
      { label: "Skipped", value: `${currentResult?.skippedCount ?? 0}` },
      { label: "Errors", value: `${currentResult?.errorCount ?? 0}` },
    ],
    [currentResult],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Structured Import Workbench"
        title="批量导入页先做强校验与反馈，再决定是否落库，减少离线环境下的误导入。"
        description="这里不是普通的文本框。它要同时承担模板提示、预检反馈和导入结果回执，适合作为 Python import service 的产品化前台。"
        actions={
          <>
            <Badge variant="outline">逐行 key=value</Badge>
            <Badge variant="secondary">预检后导入</Badge>
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
            text={text}
            setText={setText}
            onPreview={() => importMutation.mutate({ kind, text, apply: false })}
            onApply={() => importMutation.mutate({ kind, text, apply: true })}
            isPending={importMutation.isPending}
            stats={stats}
            result={currentResult}
          />
        </TabsContent>
        <TabsContent value="SCORE">
          <ImportWorkbench
            kind={kind}
            text={text}
            setText={setText}
            onPreview={() => importMutation.mutate({ kind, text, apply: false })}
            onApply={() => importMutation.mutate({ kind, text, apply: true })}
            isPending={importMutation.isPending}
            stats={stats}
            result={currentResult}
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
  onPreview,
  onApply,
  isPending,
  stats,
  result,
}: {
  kind: ImportKind;
  text: string;
  setText: (value: string) => void;
  onPreview: () => void;
  onApply: () => void;
  isPending: boolean;
  stats: Array<{ label: string; value: string }>;
  result: ImportWorkbenchResult | undefined;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
      <Card>
        <CardHeader>
          <CardTitle>{kind === "COURSE" ? "课程结构化文本" : "成绩结构化文本"}</CardTitle>
          <CardDescription>
            一行一条记录，字段使用 `;` 分隔，字段内部使用 `key=value`。先做预检，再决定是否导入。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-[340px] font-mono text-[13px]" />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onPreview} disabled={isPending || !text.trim()}>
              <ScanSearch data-icon="inline-start" />
              先做预检
            </Button>
            <Button onClick={onApply} disabled={isPending || !text.trim()}>
              <CheckCheck data-icon="inline-start" />
              确认导入
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>导入反馈</CardTitle>
            <CardDescription>强调 valid / skipped / errors，让错误成本在落库前暴露。</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {stat.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{stat.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>校验明细</CardTitle>
            <CardDescription>保留 skipped 与 errors 的逐条回执，适合离线使用时快速纠错。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result?.errors.length ? (
              result.errors.map((error) => (
                <div key={`${error.lineNumber}-${error.identifier}`} className="rounded-[22px] border border-red-400/16 bg-red-400/8 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-red-200">
                    line {error.lineNumber}
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">{error.identifier}</div>
                  <div className="mt-2 text-sm leading-6 text-red-100/86">{error.message}</div>
                </div>
              ))
            ) : result?.applied ? (
              <div className="rounded-[22px] border border-emerald-400/16 bg-emerald-400/8 p-4 text-sm leading-6 text-emerald-100">
                导入已完成，共写入 {result.importedIdentifiers.length} 条记录。
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
                暂无错误明细。点击“先做预检”查看解析结果，或直接导入已通过校验的文本。
              </div>
            )}

            {result?.importedIdentifiers.length ? (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <FileDown className="size-3.5" />
                  Imported
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm text-foreground/82">
                  {result.importedIdentifiers.map((item) => (
                    <div key={item} className="truncate">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
