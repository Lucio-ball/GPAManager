import { Database, HardDriveDownload, Sparkles } from "lucide-react";
import { SettingsDialog } from "@/components/shared/settings-dialog";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/6 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" />
            GPA Manager Desktop
          </div>
          <div className="text-sm text-foreground/88">
            本地离线工作区，围绕 GPA、目标差距、规划推演和结构化导入展开。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SettingsDialog />
          <Badge variant="outline" className="gap-2">
            <Database className="size-3.5" />
            SQLite
          </Badge>
          <Badge variant="secondary" className="gap-2">
            <HardDriveDownload className="size-3.5" />
            Offline Only
          </Badge>
        </div>
      </div>
    </header>
  );
}
