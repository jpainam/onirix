import { cn } from "@onirix/ui/lib/utils"

/** The catalog's `AnswerEffort`, spelled here so this package needs no model code. */
export type AnswerEffortValue = "low" | "medium" | "high"

const EFFORTS: readonly { value: AnswerEffortValue; label: string }[] = [
  { value: "low", label: "Fast" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "Thorough" },
]

/** What the setting comes to, for the line under its title. */
export function answerEffortSummary(
  value: AnswerEffortValue,
  /** False when the model in use has no reasoning stage to turn up. */
  reasons: boolean
): string {
  if (!reasons) return "The model in use does not reason, so this changes nothing."
  if (value === "low") return "Answers start soonest."
  if (value === "medium") return "A longer wait before the answer starts."
  return "The longest wait. For questions that take working out."
}

/**
 * How hard the model thinks before it answers: three named levels, because
 * that is what every provider takes. Drawn once for the dashboard and the
 * desktop app.
 */
export function AnswerEffortControl({
  value,
  onValueChange,
  disabled = false,
}: {
  value: AnswerEffortValue
  onValueChange: (value: AnswerEffortValue) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Thinking"
      className="flex shrink-0 rounded-lg border bg-background p-0.5"
    >
      {EFFORTS.map((effort) => (
        <button
          key={effort.value}
          type="button"
          role="radio"
          aria-checked={value === effort.value}
          disabled={disabled}
          onClick={() => onValueChange(effort.value)}
          className={cn(
            "h-7 rounded-md px-3 text-sm text-ink-03 transition-colors outline-none hover:text-ink-05 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
            value === effort.value && "bg-tint-02 text-ink-05"
          )}
        >
          {effort.label}
        </button>
      ))}
    </div>
  )
}
