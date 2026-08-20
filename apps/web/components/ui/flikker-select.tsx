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
        className={`flex h-11 w-full items-center gap-3 rounded-[11px] border bg-white px-3.5 text-left text-sm font-medium outline-none transition ${
          open
            ? "border-[#5C6BC0] shadow-[0_0_0_3px_rgba(92,107,192,0.10),0_8px_24px_rgba(41,48,93,0.08)]"
            : "border-[#DDE1EC] hover:border-[#AEB5DC]"
        } disabled:cursor-not-allowed disabled:bg-[#F5F6F9] disabled:text-[#A0A7B8]`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${selected ? "text-[#202333]" : "text-[#9AA2B5]"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#7F879C] transition-transform duration-200 ${open ? "rotate-180 text-[#5C6BC0]" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 z-[80] w-full min-w-[220px] overflow-hidden rounded-[14px] border border-[#E1E4EE] bg-white p-1.5 shadow-[0_18px_48px_rgba(27,31,59,0.16)] ${
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
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-[#EEF0FB] text-[#4F5EB0]"
                      : isActive
                        ? "bg-[#F6F7FC] text-[#202333]"
                        : "text-[#3E4353]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8B93A7]">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      isSelected
                        ? "bg-[#5C6BC0] text-white"
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
