import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MessageTone = "neutral" | "info" | "success" | "warning" | "error";

const toneClasses: Record<MessageTone, string> = {
  neutral: "border border-white/8 bg-white/[0.03] text-muted-foreground",
  info: "border border-accent/18 bg-accent/10 text-foreground/82",
  success: "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  warning: "border border-amber-400/18 bg-amber-400/10 text-amber-100",
  error: "border border-red-400/18 bg-red-400/10 text-red-100",
};

export function getMessageToneClasses(tone: MessageTone) {
  return toneClasses[tone];
}

export function InlineMessage({
  tone,
  className,
  children,
}: {
  tone: MessageTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] px-4 py-3 text-sm leading-6",
        getMessageToneClasses(tone),
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatePanel({
  tone,
  className,
  children,
}: {
  tone: Exclude<MessageTone, "info" | "success">;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[24px] px-5 py-6 text-sm leading-6",
        getMessageToneClasses(tone),
        className,
      )}
    >
      {children}
    </div>
  );
}
