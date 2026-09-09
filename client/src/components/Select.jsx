import { useEffect, useRef, useState } from "react";

function Select({ value, onChange, options = [], ariaLabel, className = "" }) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef(null);

  const selectedOption =
    options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    function handlePointerDown(event) {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function handleOptionClick(option) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      const currentIndex = options.findIndex(
        (option) => option.value === value,
      );

      const nextOption = options[currentIndex + 1];

      if (nextOption) {
        onChange(nextOption.value);
      }

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      const currentIndex = options.findIndex(
        (option) => option.value === value,
      );

      const previousOption = options[currentIndex - 1];

      if (previousOption) {
        onChange(previousOption.value);
      }
    }
  }

  return (
    <div ref={selectRef} className={`custom-select ${className}`}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? "open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label || ""}</span>

        <span className="custom-select-arrow" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="custom-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`custom-select-option ${
                option.value === value ? "selected" : ""
              }`}
              key={option.value}
              onClick={() => handleOptionClick(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Select;
