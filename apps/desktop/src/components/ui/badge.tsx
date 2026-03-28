import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "border-accent/30 bg-accent/12 text-accent",
        secondary: "border-white/8 bg-white/[0.06] text-foreground/82",
        outline: "border-white/10 bg-transparent text-muted-foreground",
        success: "border-emerald-400/20 bg-emerald-400/12 text-emerald-300",
        warning: "border-amber-400/20 bg-amber-400/12 text-amber-300",
        destructive: "border-red-400/20 bg-red-400/12 text-red-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
