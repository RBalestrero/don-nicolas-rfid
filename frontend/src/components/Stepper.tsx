interface StepItem {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepItem[];
  /** 0-based index of current step */
  current: number;
}

export default function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="stepper" aria-label="Progreso del flujo">
      {steps.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={step.id} className={`stepper-item ${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper-index">{index + 1}</span>
            <span className="stepper-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
