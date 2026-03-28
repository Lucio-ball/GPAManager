import { Badge } from "@/components/ui/badge";
import type { CourseStatus, ScoreType } from "@/types/domain";

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  if (status === "COMPLETED") {
    return <Badge variant="success">已修</Badge>;
  }

  return <Badge variant="secondary">未修</Badge>;
}

export function ScoreTypeBadge({ scoreType }: { scoreType: ScoreType | null }) {
  if (!scoreType) {
    return <Badge variant="outline">未设定</Badge>;
  }

  return (
    <Badge variant={scoreType === "PERCENTAGE" ? "outline" : "secondary"}>
      {scoreType === "PERCENTAGE" ? "百分制" : "等级制"}
    </Badge>
  );
}
