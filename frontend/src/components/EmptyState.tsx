import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state-block" role="status">
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
