import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 pr-11 text-sm text-foreground outline-none transition-all focus:border-accent/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);

Select.displayName = "Select";

export { Select };
