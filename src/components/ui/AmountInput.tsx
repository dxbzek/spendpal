import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeAmount } from "@/lib/finance/normalizeAmount";

// Re-exported so existing imports keep working; the rules live in
// src/lib/finance/normalizeAmount.ts.
export { normalizeAmount };

export interface AmountInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type" | "inputMode" | "onChange"> {
  /** Controlled string value, e.g. "1234.50". */
  value: string;
  /** Receives the normalized decimal string. */
  onChange: (value: string) => void;
  /** Keep a leading minus: an overdrawn balance, or a card in credit. */
  allowNegative?: boolean;
}

/**
 * Money input that shows the decimal keypad on iOS (`inputMode="decimal"`),
 * accepts comma or dot decimals and thousands separators, and never zooms on
 * focus (16px base font). Callers keep a string value and `parseFloat` on
 * submit as before.
 *
 * The box keeps the text as typed while it has focus. Rewriting it on every
 * keystroke turned "20," into "20." before the "000" arrived, so a thousands
 * comma could never be told from a decimal one. The caller always receives
 * the normalized number, and on blur the box shows that number, so what is
 * on screen is what gets saved.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, onBlur, allowNegative = false, className, placeholder = "0.00", ...props }, ref) => {
    const [text, setText] = React.useState(value);
    // The caller changed the value itself (form reset, edit prefill): show that.
    if (normalizeAmount(text, { allowNegative }) !== value && text !== value) setText(value);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        pattern={allowNegative ? "-?[0-9.,]*" : "[0-9.,]*"}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const typed = e.target.value.replace(allowNegative ? /[^0-9.,\-−]/g : /[^0-9.,]/g, "");
          setText(typed);
          onChange(normalizeAmount(typed, { allowNegative }));
        }}
        onBlur={(e) => {
          setText(value);
          onBlur?.(e);
        }}
        className={cn("text-base", className)}
        {...props}
      />
    );
  },
);
AmountInput.displayName = "AmountInput";
