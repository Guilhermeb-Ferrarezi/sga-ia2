import type { ReactNode } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  delay?: number;
}

export default function MetricCard({
  title,
  value,
  icon,
  delay = 0,
}: MetricCardProps) {
  return (
    <Card
      className="animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader className="pb-2">
        <CardDescription className="text-sm">{title}</CardDescription>
        <CardTitle className="flex items-center justify-between">
          <span className="text-3xl font-bold">{value}</span>
          {icon}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
