import { useMemo, useState } from "react";
import { Cog, Database, MonitorSmartphone, TerminalSquare } from "lucide-react";
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
import { isTauriRuntime } from "@/services/bridge";

const rows = [
  {
    label: "Bridge 命令",
    value: "desktop_bridge -> Python bridge -> SQLite",
    icon: TerminalSquare,
  },
  {
    label: "默认数据库",
    value: "data/gpa_manager.sqlite3",
    icon: Database,
  },
  {
    label: "推荐启动",
    value: "cd apps/desktop && npm run tauri:dev",
    icon: MonitorSmartphone,
  },
] as const;

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const runtimeLabel = useMemo(() => (isTauriRuntime() ? "Tauri Desktop" : "Browser Mock"), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Cog data-icon="inline-start" />
          设置
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>桌面设置与联调提示</DialogTitle>
          <DialogDescription>
            保持轻量入口，不新增完整页面。这里集中展示当前运行模式、默认数据位置和最小联调提示。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Runtime
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{runtimeLabel}</Badge>
              <Badge variant="secondary">Deep Dark Theme</Badge>
              <Badge variant="secondary">Offline Only</Badge>
            </div>
          </div>

          <div className="grid gap-3">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-start gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-accent ring-1 ring-white/10">
                    <Icon className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {row.label}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/84">{row.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[24px] border border-accent/18 bg-accent/10 p-4 text-sm leading-7 text-foreground/82">
            可选环境变量：
            <br />
            `GPA_MANAGER_PYTHON=python3`
            <br />
            `GPA_MANAGER_DB_PATH=/absolute/path/to/db.sqlite3`
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
