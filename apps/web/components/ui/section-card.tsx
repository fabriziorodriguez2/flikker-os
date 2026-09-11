import type { ReactNode } from "react";
import Card from "./card";
import SectionHeader from "./section-header";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "default" | "tinted";
  interactive?: boolean;
}

export default function SectionCard({
  title,
  description,
  action,
  children,
  tone = "default",
  interactive = false,
}: SectionCardProps) {
  return (
    <Card
      variant={
        interactive ? "interactive" : tone === "tinted" ? "muted" : "default"
      }
      padding="md"
      role="region"
      aria-label={title}
    >
      <SectionHeader title={title} description={description} action={action} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}
