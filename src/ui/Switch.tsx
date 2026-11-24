import { useId, type ReactNode } from "react";

/** On/off setting row. The whole row is the hit target. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="ui-switchrow" htmlFor={id}>
      <span className="ui-row__text">
        <span className="ui-row__title">{label}</span>
        {description && <span className="ui-row__meta">{description}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ui-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  );
}
