"use client";

import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { Card, PillButton } from "@/components/ui";

/** "Refilled": asks the REAL number bought (we never assume the ordered quantity arrived). */
export function RefilledForm({ form, busy, onSubmit }: { form: string; busy: boolean; onSubmit: (qty: number) => void }) {
  const [qty, setQty] = useState("");
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= 1 && n <= 1000;
  return (
    <Card className="p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(n);
        }}
      >
        <label className="block font-bold">
          How many {form.toLowerCase()}s did you get?
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Count from the box"
            className="mt-2 min-h-12 w-full rounded-sm border border-line bg-surface px-3 text-lg font-bold outline-none focus:border-green-700"
          />
        </label>
        <PillButton type="submit" variant="green" className="mt-3 w-full" disabled={!valid || busy}>
          <PackageCheck className="size-5" aria-hidden /> {busy ? "Saving…" : "Add to stock"}
        </PillButton>
      </form>
    </Card>
  );
}
