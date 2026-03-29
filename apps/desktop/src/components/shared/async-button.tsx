import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type AsyncButtonProps = Omit<ButtonProps, "children"> & {
  idleLabel: string;
  pendingLabel: string;
  pending: boolean;
  icon?: ReactNode;
};

export function AsyncButton({
  idleLabel,
  pendingLabel,
  pending,
  disabled,
  icon,
  ...props
}: AsyncButtonProps) {
  return (
    <Button disabled={disabled || pending} {...props}>
      {pending ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : (
        icon
      )}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
