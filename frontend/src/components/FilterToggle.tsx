interface FilterToggleProps {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: string;
  disabled?: boolean;
}

/** Botón de filtro binario; queda resaltado cuando está activo. */
export default function FilterToggle({
  pressed,
  onPressedChange,
  children,
  disabled,
}: FilterToggleProps) {
  return (
    <button
      type="button"
      className={`btn btn-sm filter-toggle${pressed ? " is-active" : " secondary"}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
    >
      {children}
    </button>
  );
}
