"use client";

// Month + year picker for an unclear expiry date. Starts EMPTY on purpose:
// Zero-Guess means we never pre-fill a date the person has not read from the strip.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ExpiryPicker({ month, year, onMonth, onYear }: { month: string; year: string; onMonth: (m: string) => void; onYear: (y: string) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 16 }, (_, i) => String(thisYear - 5 + i)); // today−5 … today+10
  const select = "min-h-14 w-full rounded-sm border-2 border-dashed border-warn bg-warn-soft/50 px-3 text-lg font-bold text-ink";
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-2">Expiry month</span>
        <select aria-label="Expiry month" value={month} onChange={(e) => onMonth(e.target.value)} className={select}>
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-2">Expiry year</span>
        <select aria-label="Expiry year" value={year} onChange={(e) => onYear(e.target.value)} className={select}>
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
