import { useEffect, useState } from "react";
import { AsyncButton } from "@/components/shared/async-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  pending = false,
  tone = "default",
  requiredValue,
  requiredValueLabel,
  confirmHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "default" | "danger";
  requiredValue?: string;
  requiredValueLabel?: string;
  confirmHint?: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const requiresMatch = Boolean(requiredValue);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
    }
  }, [open]);

  const isMatch = !requiresMatch || confirmText.trim() === requiredValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requiresMatch ? (
          <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              二次确认
            </div>
            <div className="mt-2 text-sm leading-6 text-foreground/82">
              请输入 {requiredValueLabel ?? "指定内容"}：
              <span className="ml-1 font-mono text-accent">{requiredValue}</span>
            </div>
            {confirmHint ? (
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{confirmHint}</div>
            ) : null}
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={`请输入 ${requiredValue}`}
              className="mt-3"
            />
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              取消
            </Button>
          </DialogClose>
          <AsyncButton
            pending={pending}
            idleLabel={confirmLabel}
            pendingLabel={pendingLabel}
            onClick={onConfirm}
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={!isMatch}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
