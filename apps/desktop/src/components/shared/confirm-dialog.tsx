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
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
