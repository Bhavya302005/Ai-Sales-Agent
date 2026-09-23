"use client";

import { useEffect, useRef, useState } from "react";

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
}

export function CustomSelect({
  value: controlledValue,
  defaultValue = "",
  onChange,
  options,
  placeholder = "Select...",
  ariaLabel,
  className = "",
  name,
  required,
  disabled = false,
}: CustomSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internalValue;

  const selectedOption = options.find((opt) => opt.value === currentValue);

  // Sync internal value when defaultValue changes from external props (e.g. Next.js navigation)
  useEffect(() => {
    if (!isControlled) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, isControlled]);

  function handleSelect(val: string) {
    if (!isControlled) {
      setInternalValue(val);
    }
    onChange?.(val);
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }

  // Intercept form submission if required and no value is selected
  useEffect(() => {
    if (!required) return;
    const form = containerRef.current?.closest("form");
    if (!form) return;
    const handleSubmit = (e: SubmitEvent) => {
      if (!currentValue) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
        triggerRef.current?.focus();
      }
    };
    form.addEventListener("submit", handleSubmit as EventListener);
    return () => form.removeEventListener("submit", handleSubmit as EventListener);
  }, [required, currentValue]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return;
      if (!isOpen) {
        if (
          document.activeElement === triggerRef.current &&
          (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          setIsOpen(true);
          const currentIndex = options.findIndex((opt) => opt.value === currentValue);
          setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleSelect(options[focusedIndex].value);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, options, currentValue, disabled]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionsListRef.current) {
      const optionButtons = optionsListRef.current.querySelectorAll<HTMLButtonElement>(".custom-select-option");
      if (optionButtons[focusedIndex]) {
        optionButtons[focusedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, focusedIndex]);

  return (
    <div className={`custom-select-container ${className} ${disabled ? "disabled" : ""}`} ref={containerRef}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        ref={triggerRef}
        type="button"
        className={`custom-select-trigger ${isOpen ? "open" : ""} ${disabled ? "disabled" : ""}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
          if (!isOpen) {
            const currentIndex = options.findIndex((opt) => opt.value === currentValue);
            setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-disabled={disabled}
      >
        <span className="custom-select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`custom-select-chevron ${isOpen ? "rotated" : ""}`}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1.5L6 6.5L11 1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="custom-select-dropdown" role="listbox" ref={optionsListRef}>
          {options.length === 0 ? (
            <div className="custom-select-empty">No options available</div>
          ) : (
            options.map((option, idx) => {
              const isSelected = option.value === currentValue;
              const isKeyboardFocused = idx === focusedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`custom-select-option ${isSelected ? "selected" : ""} ${
                    isKeyboardFocused ? "focused" : ""
                  }`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  <span className="custom-select-option-label">{option.label}</span>
                  {isSelected && (
                    <svg
                      className="custom-select-checkmark"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
