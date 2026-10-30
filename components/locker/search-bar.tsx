"use client";

import { Search, X } from "lucide-react";

/** Rounded search input with a clear button (DESIGN.md §7). Searches confirmed text only. */
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-input border border-line bg-surface px-4 shadow-card">
      <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-12 w-full bg-transparent outline-none placeholder:text-ink-2 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search" className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
          <X className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
