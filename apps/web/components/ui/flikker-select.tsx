"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface FlikkerSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export default function FlikkerSelect({
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  disabled = false,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: readonly FlikkerSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openMenu() {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < 270 && rect.top > below);
    }
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function enabledIndex(from: number, direction: 1 | -1) {
    if (!options.length) return -1;
    let next = from;
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) return next;
    }
    return -1;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const next = enabledIndex(
        activeIndex,
        event.key === "ArrowDown" ? 1 : -1,
      );
      if (next >= 0) setActiveIndex(next);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      const first = options.findIndex((option) => !option.disabled);
      if (first >= 0) setActiveIndex(first);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      const last = options.findLastIndex((option) => !option.disabled);
      if (last >= 0) setActiveIndex(last);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex h-10 w-full items-center gap-3 rounded-[var(--panel-radius-control)] border bg-[color:var(--panel-surface)] px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color:var(--panel-focus-ring)] ${
          open
            ? "border-[color:var(--panel-accent)]"
            : "border-[color:var(--panel-border)] hover:border-[color:var(--panel-border-strong)]"
        } disabled:cursor-not-allowed disabled:bg-[color:var(--panel-surface-muted)] disabled:text-[color:var(--panel-text-disabled)]`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${selected ? "text-[color:var(--panel-text)]" : "text-[color:var(--panel-text-disabled)]"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[color:var(--panel-text-muted)] transition-transform duration-150 ${open ? "rotate-180 text-[color:var(--panel-accent)]" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 z-[80] w-full min-w-[220px] overflow-hidden rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-1.5 shadow-lg ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="max-h-64 overflow-y-auto overscroll-contain py-0.5">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={`flex w-full items-center gap-3 rounded-[var(--panel-radius-control)] px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-info-text)]"
                      : isActive
                        ? "bg-[color:var(--panel-surface-subtle)] text-[color:var(--panel-text)]"
                        : "text-[color:var(--panel-text-secondary)]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-[color:var(--panel-text-muted)]">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                      isSelected
                        ? "bg-[color:var(--panel-accent)] text-white"
                        : "text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
