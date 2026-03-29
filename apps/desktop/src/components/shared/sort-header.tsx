import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export type SortDirection = "asc" | "desc";

export function SortHeader({
  label,
  active,
  direction,
  onToggle,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-0.5 py-1 transition hover:text-foreground",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

