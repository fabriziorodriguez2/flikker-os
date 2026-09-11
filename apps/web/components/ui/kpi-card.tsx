import Card from "./card";
import Metric from "./metric";

interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  positive: boolean;
}

export default function KPICard({
  label,
  value,
  change,
  positive,
}: KPICardProps) {
  return (
    <Card>
      <Metric
        label={label}
        value={value}
        change={
          <>
            <span aria-hidden="true">{positive ? "↑" : "↓"}</span> {change}
          </>
        }
        changeTone={positive ? "positive" : "negative"}
      />
    </Card>
  );
}
