import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Pasos cortos de orientación (onboarding) */
  steps?: string[];
  action?: ReactNode;
}

export default function EmptyState({ title, description, steps, action }: EmptyStateProps) {
  return (
    <div className="empty-state-block" role="status">
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state">{description}</p>}
      {steps && steps.length > 0 && (
        <ol className="empty-state-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
