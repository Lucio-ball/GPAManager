import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,rgba(255,180,159,0.98),rgba(255,144,113,0.98))] text-white shadow-[0_18px_40px_-20px_rgba(223,127,93,0.55)] hover:translate-y-[-1px] hover:brightness-[1.02]",
        secondary: "bg-white/76 text-foreground ring-1 ring-[#eadfd8] hover:bg-[#fff1eb]",
        outline: "border border-[#e9d8cf] bg-transparent text-foreground hover:bg-white/68",
        ghost: "text-muted-foreground hover:bg-[#fff1eb] hover:text-foreground",
        destructive:
          "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 hover:text-red-800",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-6 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
