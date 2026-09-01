"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayKeyLabel, todayKey } from "@/lib/due-date";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const POPOVER_WIDTH = 280;
const VIEWPORT_PAD = 12;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function fromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function placeFromButton(button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  const maxLeft = window.innerWidth - VIEWPORT_PAD - POPOVER_WIDTH;
  const left = Math.min(Math.max(rect.left, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, maxLeft));
  const top = rect.bottom + 6;
  return { top, left };
}

export function DayPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const today = todayKey();
  const selected = fromKey(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = fromKey(value);
    setView({ year: parsed.year, month: parsed.month });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (buttonRef.current) setCoords(placeFromButton(buttonRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const cells = useMemo(() => {
    const start = firstWeekday(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    const blanks = Array.from({ length: start }, () => null);
    const days = Array.from({ length: total }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [view]);

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const date = new Date(current.year, current.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  };

  const pick = (day: number) => {
    onChange(toKey(view.year, view.month, day));
    setOpen(false);
  };

  const calendar = open && coords && typeof document !== "undefined" ? (
    createPortal(
      <div
        ref={popoverRef}
        role="dialog"
        className="fixed z-[80] w-[17.5rem] rounded-xl border border-brand-200 bg-white p-3 shadow-lg"
        style={{ top: coords.top, left: coords.left }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-1 rounded-lg text-brand-600 hover:bg-cream-200"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-xs font-semibold text-brand-800">
            {MONTHS[view.month - 1]} {view.year}
          </p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-1 rounded-lg text-brand-600 hover:bg-cream-200"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map((day) => (
            <span key={day} className="text-[10px] font-medium text-brand-400 text-center py-1">
              {day}
            </span>
          ))}
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} />;
            const key = toKey(view.year, view.month, day);
            const isSelected = key === value;
            const isToday = key === today;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(day)}
                className={cn(
                  "h-8 rounded-lg text-[11px] font-medium",
                  isSelected
                    ? "bg-brand-500 text-white"
                    : isToday
                      ? "text-orange-700 bg-orange-50 hover:bg-orange-100"
                      : "text-brand-800 hover:bg-cream-200"
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-brand-100">
          <button
            type="button"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
            className="text-[11px] font-medium text-brand-600 hover:underline"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[11px] font-medium text-brand-400 hover:text-brand-600"
          >
            Tutup
          </button>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn("relative", compact ? "" : "w-full mt-2")}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white text-left font-medium text-orange-800 hover:bg-orange-50",
          compact ? "px-1.5 py-1" : "px-2 py-1.5 w-full"
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Calendar className="w-3.5 h-3.5 text-orange-600 shrink-0" />
        <span className="text-[11px] sm:text-xs truncate">
          {formatDayKeyLabel(value)}
        </span>
      </button>
      {calendar}
    </div>
  );
}
