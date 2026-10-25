import type { ChoiceOption } from "./choices";

const LETTERS = ["A", "B", "C", "D"];

export function ChoiceList({
  options,
  pickedId,
  correctId,
  onPick,
}: {
  options: ChoiceOption[];
  pickedId: string | null;
  correctId: string;
  onPick: (id: string) => void;
}) {
  const answered = pickedId !== null;
  return (
    <div className="choices" role="group" aria-label="Latin names">
      {options.map((option, index) => {
        const correct = option.id === correctId;
        const picked = option.id === pickedId;
        const state = !answered
          ? ""
          : correct
            ? " is-correct"
            : picked
              ? " is-wrong"
              : " is-dim";
        return (
          <button
            key={option.id}
            type="button"
            className={`choice${state}`}
            disabled={answered}
            aria-pressed={picked}
            onClick={() => onPick(option.id)}
          >
            <span className="choice-key">{LETTERS[index] ?? index + 1}</span>
            <span className="choice-label">{option.label}</span>
            {!answered && <kbd>{index + 1}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
