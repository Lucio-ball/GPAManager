import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  eyebrow?: string;
  accent?: "default" | "success" | "warning";
  trailing?: ReactNode;
};

const accentStyles: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default: "from-accent/18 to-accent/5",
  success: "from-emerald-400/18 to-emerald-400/5",
  warning: "from-amber-400/18 to-amber-400/5",
};

export function MetricCard({
  label,
  value,
  description,
  eyebrow,
  accent = "default",
  trailing,
}: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-x-0 top-0 h-20 bg-gradient-to-b", accentStyles[accent])} />
      <CardHeader className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow ?? label}
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{value}</CardTitle>
          </div>
          {trailing ?? (
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.05] text-muted-foreground ring-1 ring-white/8">
              <ArrowUpRight className="size-4" />
            </div>
          )}
        </div>
        <CardDescription className="mt-3 text-sm leading-6">{label}</CardDescription>
      </CardHeader>
      <CardContent className="relative pt-0 text-sm leading-6 text-foreground/78">
        {description}
      </CardContent>
    </Card>
  );
}
