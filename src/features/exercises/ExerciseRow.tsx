import { memo, useMemo, type ReactNode } from "react";
import { involvementLevels, MiniBodyMap } from "../../bodymap";
import { cx, IconCheck } from "../../ui";
import { equipmentList, muscleList } from "./labels";
import type { ExerciseEntry } from "./model";

export const IconStar = ({ filled, size = 24 }: { filled?: boolean; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />
  </svg>
);

export type ExerciseRowProps = {
  ex: ExerciseEntry;
  /** Measured: logged in several sessions. */
  usual: boolean;
  /** Curated: editorial commonness. */
  staple: boolean;
  favorite: boolean;
  onToggleFavorite?: (exId: string) => void;
  /** Extra explanation line, e.g. substitution reason. */
  why?: ReactNode;
  href?: string;
  onActivate?: (exId: string) => void;
  /** Multi-select state (renders a check box look). */
  checked?: boolean;
};

/** Result row: body-map thumbnail, name, equipment, primary muscles, usual/staple markers, star. */
export const ExerciseRow = memo(function ExerciseRow({
  ex,
  usual,
  staple,
  favorite,
  onToggleFavorite,
  why,
  href,
  onActivate,
  checked,
}: ExerciseRowProps) {
  const levels = useMemo(() => involvementLevels([ex]), [ex]);
  const body = (
    <>
      <span className="exrow__map">
        <MiniBodyMap levels={levels} />
      </span>
      <span className="exrow__text">
        <span className="exrow__name">{ex.name}</span>
        <span className="exrow__meta">
          {equipmentList(ex.equipment)}
          {ex.primary.length > 0 && <> · {muscleList(ex.primary)}</>}
        </span>
        {(why || usual || staple || ex.custom) && (
          <span className="exrow__tags">
            {usual && <span className="exmark exmark--usual">Your usual</span>}
            {staple && <span className="exmark">Staple</span>}
            {ex.custom && <span className="exmark">Custom</span>}
            {why && <span className="exrow__why">{why}</span>}
          </span>
        )}
      </span>
      {checked !== undefined && (
        <span className={cx("exrow__check", checked && "is-on")} aria-hidden="true">
          {checked && <IconCheck size={18} />}
        </span>
      )}
    </>
  );
  return (
    <li className="exrow">
      {href ? (
        <a className="exrow__main" href={href}>
          {body}
        </a>
      ) : (
        <button type="button" className="exrow__main" aria-pressed={checked} onClick={() => onActivate?.(ex.exId)}>
          {body}
        </button>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          className={cx("exrow__star", favorite && "is-on")}
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${ex.name} from favorites` : `Favorite ${ex.name}`}
          onClick={() => onToggleFavorite(ex.exId)}
        >
          <IconStar filled={favorite} size={22} />
        </button>
      )}
    </li>
  );
});
