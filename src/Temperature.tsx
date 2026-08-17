import { TEMPERATURE_WORDS } from "./types";

interface Props {
  value: number | null;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}

export function Temperature({ value, onChange, readOnly }: Props) {
  return (
    <div className={"dots" + (readOnly ? " readonly" : "")} role="radiogroup" aria-label="温度 1 到 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} 度`}
          className={
            "dot" +
            (value !== null && n <= value ? " lit" : "") +
            (value === n ? " active" : "")
          }
          onClick={() => onChange?.(n)}
        />
      ))}
      {!readOnly && (
        <span className="temperature-word">
          {value !== null ? TEMPERATURE_WORDS[value] : " "}
        </span>
      )}
    </div>
  );
}
