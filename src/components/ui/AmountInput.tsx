import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Normalize free-form money input to a clean decimal string:
 * - comma decimal separators become dots ("1,50" -> "1.50")
 * - everything that is not a digit or dot is stripped
 * - multiple dots collapse to the first (so "1.2.3" -> "1.2")
 *
 * Leading zeros are preserved. This fixes comma-locale data corruption that
 * `parseFloat` + `<input type="number">` silently introduced.
 */
export function normalizeAmount(raw: string): string {
  return raw
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "")
    .replace(/(\..*)\./g, "$1");
}

export interface AmountInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type" | "inputMode" | "onChange"> {
  /** Controlled string value, e.g. "1234.50". */
  value: string;
  /** Receives the normalized decimal string. */
  onChange: (value: string) => void;
}

/**
 * Money input that shows the decimal keypad on iOS (`inputMode="decimal"`),
 * accepts comma or dot decimals, and never zooms on focus (16px base font).
 * Drop-in replacement for money `<Input type="number">` fields — callers keep
 * a string value and `parseFloat` on submit as before.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, className, placeholder = "0.00", ...props }, ref) => (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(normalizeAmount(e.target.value))}
      className={cn("text-base", className)}
      {...props}
    />
  ),
);
AmountInput.displayName = "AmountInput";
