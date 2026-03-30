import {
  BookOpen,
  Gauge,
  Import,
  LibraryBig,
  Scale,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";

const navigation = [
  { to: "/", label: "首页仪表盘", description: "GPA 总览与目标差距", icon: Gauge, end: true },
  { to: "/courses", label: "课程管理", description: "课程状态、学分与学期", icon: LibraryBig },
  { to: "/scores", label: "成绩管理", description: "录入缺口与绩点映射", icon: BookOpen },
  { to: "/planning", label: "目标规划", description: "目标 GPA 倒推与三情景", icon: Scale },
  { to: "/import", label: "批量导入", description: "逐行文本校验与导入反馈", icon: Import },
];

export function AppSidebar() {
  return (
    <aside className="border-b border-[#ead8ce]/80 bg-[linear-gradient(180deg,rgba(255,251,247,0.96),rgba(251,241,233,0.9))] lg:min-h-screen lg:border-b-0 lg:border-r">
      <ScrollArea className="h-full">
        <div className="flex min-h-full flex-col gap-8 px-4 py-5 sm:px-6">
          <div className="rounded-[28px] border border-[#eadfd8] bg-white/78 p-5 shadow-[0_26px_80px_-44px_rgba(193,128,97,0.28)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/16 text-[hsl(14,72%,53%)] ring-1 ring-accent/25">
                <Gauge className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Product Shell
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  GPA Manager
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              奶油底的本地学业控制台。信息密度适中，突出 GPA、剩余空间与导入质量。
            </p>
          </div>

          <nav className="flex flex-col gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "group rounded-[24px] border border-transparent px-4 py-3 transition-all duration-200",
                      "hover:border-[#ebddd5] hover:bg-white/68",
                      isActive && "border-[#e7d1c6] bg-[#fff2ea] shadow-[0_18px_52px_-32px_rgba(201,131,99,0.32)]",
                    )
                  }
                >
                  {({ isActive }) => (
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-10 items-center justify-center rounded-2xl ring-1 transition-colors",
                          isActive
                            ? "bg-accent/16 text-[hsl(14,72%,53%)] ring-accent/28"
                            : "bg-white/72 text-foreground/75 ring-[#eadfd8]",
                        )}
                      >
                        <Icon className="size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="rounded-[24px] border border-[#eadfd8] bg-[linear-gradient(135deg,rgba(255,243,236,0.96),rgba(255,252,250,0.7)_55%,rgba(255,233,222,0.5))] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Local Integration
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground/88">
              React UI 通过 Tauri command 调用 Python bridge，bridge 再复用现有 service/repository 层。
            </p>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
