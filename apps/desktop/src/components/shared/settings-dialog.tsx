import { useMemo, useState } from "react";
import {
  Copy,
  Cog,
  Database,
  FileJson,
  FolderArchive,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useAppPreferences } from "@/components/shared/app-preferences";
import { AsyncButton } from "@/components/shared/async-button";
import { InlineMessage } from "@/components/shared/status-message";
import { useAppFeedback } from "@/components/shared/feedback-center";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  useAppInfoQuery,
  useCreateBackupMutation,
  useExportSnapshotMutation,
} from "@/hooks/use-snapshot-query";
import { isTauriRuntime } from "@/services/bridge";

function PreferenceToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 rounded border-white/15 bg-transparent accent-[var(--color-accent)]"
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}

function StorageRow({
  label,
  value,
  description,
  icon: Icon,
  onCopy,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Database;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-accent ring-1 ring-white/10">
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {label}
            </div>
            <div className="mt-2 break-all font-mono text-xs leading-6 text-foreground/88">
              {value}
            </div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onCopy(value)}>
          <Copy className="size-3.5" />
          复制
        </Button>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const runtimeLabel = useMemo(() => (isTauriRuntime() ? "Tauri Desktop" : "Browser Mock"), []);
  const feedback = useAppFeedback();
  const appInfoQuery = useAppInfoQuery();
  const backupMutation = useCreateBackupMutation();
  const exportMutation = useExportSnapshotMutation();
  const { preferences, updatePreferences, resetPreferences } = useAppPreferences();

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      feedback.success("路径已复制", value);
    } catch {
      feedback.error("复制失败", "当前环境不支持自动复制，请手动复制路径。");
    }
  };

  const appInfo = appInfoQuery.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Cog data-icon="inline-start" />
          设置
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>设置与数据安全</DialogTitle>
          <DialogDescription>
            这里集中处理真实使用时最容易忽略的事情：数据库位置、应用数据目录、备份导出和常用录入偏好。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Runtime
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{runtimeLabel}</Badge>
              <Badge variant="secondary">Offline SQLite</Badge>
              <Badge variant="secondary">Desktop Backup</Badge>
            </div>
            <div className="mt-3 text-sm leading-6 text-muted-foreground">
              默认情况下，桌面版会把 SQLite 数据库放到应用数据目录，而不是仓库内，方便长期使用、升级和迁移。
            </div>
          </div>

          {appInfoQuery.isLoading ? (
            <InlineMessage tone="neutral">正在读取当前桌面数据目录...</InlineMessage>
          ) : null}

          {appInfoQuery.isError ? (
            <InlineMessage tone="error">
              {appInfoQuery.error instanceof Error
                ? appInfoQuery.error.message
                : "读取桌面数据目录失败。"}
            </InlineMessage>
          ) : null}

          {appInfo ? (
            <div className="grid gap-3">
              <StorageRow
                label="当前数据库路径"
                value={appInfo.databasePath}
                description="这是桌面版正在使用的 SQLite 数据库文件。备份会从这里生成。"
                icon={Database}
                onCopy={(value) => void copyToClipboard(value)}
              />
              <StorageRow
                label="应用数据目录"
                value={appInfo.dataDirectory}
                description="桌面版自己的长期数据目录。默认数据库、备份和导出文件都会围绕这个目录组织。"
                icon={HardDrive}
                onCopy={(value) => void copyToClipboard(value)}
              />
              <StorageRow
                label="备份目录"
                value={appInfo.backupDirectory}
                description="每次手动备份都会生成独立的 SQLite 备份文件，适合回滚和长期留档。"
                icon={FolderArchive}
                onCopy={(value) => void copyToClipboard(value)}
              />
              <StorageRow
                label="导出目录"
                value={appInfo.exportDirectory}
                description="导出会写入可读 JSON 快照，方便外部留档、同步或手动排查。"
                icon={FileJson}
                onCopy={(value) => void copyToClipboard(value)}
              />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="size-4 text-accent" />
                数据保护
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                备份适合完整恢复；导出适合留档、排查和迁移时查看内容。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <AsyncButton
                  variant="secondary"
                  onClick={() => backupMutation.mutate({ label: "manual" })}
                  pending={backupMutation.isPending}
                  idleLabel="创建数据库备份"
                  pendingLabel="备份中..."
                  icon={<FolderArchive data-icon="inline-start" />}
                />
                <AsyncButton
                  onClick={() => exportMutation.mutate({ label: "manual" })}
                  pending={exportMutation.isPending}
                  idleLabel="导出 JSON 快照"
                  pendingLabel="导出中..."
                  icon={<FileJson data-icon="inline-start" />}
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TerminalSquare className="size-4 text-accent" />
                Bridge 信息
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                当前桌面链路仍然保持 React - Tauri - Python bridge - SQLite，重点是把路径和存储行为稳定下来。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">desktop_bridge</Badge>
                <Badge variant="secondary">Python service layer</Badge>
                <Badge variant="secondary">SQLite snapshot refresh</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">录入默认偏好</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  这些偏好会直接影响课程新建、成绩录入和批量导入确认流程。
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetPreferences}>
                <RefreshCw className="size-3.5" />
                恢复默认
              </Button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  默认学期
                </span>
                <Input
                  value={preferences.defaultSemester}
                  onChange={(event) => updatePreferences({ defaultSemester: event.target.value })}
                  placeholder="例如：2026春"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  默认课程状态
                </span>
                <Select
                  value={preferences.defaultCourseStatus}
                  onChange={(event) =>
                    updatePreferences({
                      defaultCourseStatus: event.target.value as "PLANNED" | "COMPLETED",
                    })
                  }
                >
                  <option value="PLANNED">未修</option>
                  <option value="COMPLETED">已修</option>
                </Select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  默认成绩类型
                </span>
                <Select
                  value={preferences.defaultScoreType}
                  onChange={(event) =>
                    updatePreferences({
                      defaultScoreType: event.target.value as "PERCENTAGE" | "GRADE",
                    })
                  }
                >
                  <option value="PERCENTAGE">百分制</option>
                  <option value="GRADE">等级制</option>
                </Select>
              </label>
            </div>

            <div className="mt-4 grid gap-3">
              <PreferenceToggle
                checked={preferences.importConfirmRequired}
                onChange={(checked) => updatePreferences({ importConfirmRequired: checked })}
                label="正式导入前必须二次确认"
                description="默认开启。先看预检结果，再确认落库，避免一键误导入。"
              />
              <PreferenceToggle
                checked={preferences.backupBeforeImport}
                onChange={(checked) => updatePreferences({ backupBeforeImport: checked })}
                label="正式导入前先自动备份数据库"
                description="默认开启。适合长期使用时保底，导入有误也能快速回滚。"
              />
              <PreferenceToggle
                checked={preferences.autoSelectNextPendingScore}
                onChange={(checked) => updatePreferences({ autoSelectNextPendingScore: checked })}
                label="保存成绩后自动跳到下一门待录入课程"
                description="默认开启。集中补录一批成绩时更顺手，减少来回点选。"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

