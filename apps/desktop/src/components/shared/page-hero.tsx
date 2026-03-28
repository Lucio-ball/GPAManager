import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHero({ eyebrow, title, description, actions, className }: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.03))] px-6 py-6 shadow-[0_36px_120px_-48px_rgba(0,0,0,0.88)] sm:px-8 sm:py-8",
        className,
      )}
    >
      <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top,rgba(111,219,255,0.18),transparent_55%)] lg:block" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl lg:text-[2.8rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/74 sm:text-[15px]">
            {description}
          </p>
        </div>
        {actions ? <div className="relative flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
