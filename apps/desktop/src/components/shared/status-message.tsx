import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MessageTone = "neutral" | "info" | "success" | "warning" | "error";

const toneClasses: Record<MessageTone, string> = {
  neutral: "border border-[#eadfd8] bg-white/70 text-muted-foreground",
  info: "border border-accent/22 bg-accent/12 text-foreground/76",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border border-amber-200 bg-amber-50 text-amber-800",
  error: "border border-red-200 bg-red-50 text-red-800",
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
