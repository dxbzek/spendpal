import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmountInput } from "@/components/ui/AmountInput";

// A form the way the app's dialogs use the field: a string in state, parsed
// with parseFloat on save.
const Form = ({ initial = "", allowNegative = false }: { initial?: string; allowNegative?: boolean }) => {
  const [amount, setAmount] = useState(initial);
  return (
    <>
      <AmountInput aria-label="Amount" value={amount} onChange={setAmount} allowNegative={allowNegative} />
      <output data-testid="saved">{amount}</output>
      <button onClick={() => setAmount("")}>Reset</button>
    </>
  );
};

const field = () => screen.getByLabelText("Amount") as HTMLInputElement;
const saved = () => screen.getByTestId("saved").textContent;

/** Types one character at a time, the way a keyboard does. */
const type = (text: string) => {
  for (let i = 1; i <= text.length; i++) fireEvent.change(field(), { target: { value: text.slice(0, i) } });
};

describe("AmountInput", () => {
  // Regression: the box rewrote "20," to "20." at once, so the finished entry
  // read "20.000" and 20 was saved.
  it("saves 20000 when 20,000 is typed one key at a time", () => {
    render(<Form />);
    type("20,000");
    expect(saved()).toBe("20000");
    expect(field().value).toBe("20,000");
  });

  it("saves 1234.50 for both 1,234.50 and 1.234,50", () => {
    const { unmount } = render(<Form />);
    type("1,234.50");
    expect(parseFloat(saved()!)).toBe(1234.5);
    unmount();
    render(<Form />);
    type("1.234,50");
    expect(parseFloat(saved()!)).toBe(1234.5);
  });

  it("still reads a comma as a decimal for 1,50", () => {
    render(<Form />);
    type("1,50");
    expect(saved()).toBe("1.50");
  });

  it("shows the number that will be saved once the field loses focus", () => {
    render(<Form />);
    type("20,000");
    fireEvent.blur(field());
    expect(field().value).toBe("20000");
  });

  it("follows a value set by the form", () => {
    render(<Form initial="1234.5" />);
    expect(field().value).toBe("1234.5");
    type("99");
    fireEvent.click(screen.getByText("Reset"));
    expect(field().value).toBe("");
  });

  it("keeps a minus only where negatives are allowed", () => {
    const { unmount } = render(<Form />);
    type("-150.25");
    expect(saved()).toBe("150.25");
    unmount();
    render(<Form allowNegative />);
    type("-150.25");
    expect(saved()).toBe("-150.25");
  });

  it("shows a prefilled negative balance as it is", () => {
    render(<Form initial="-150.25" allowNegative />);
    expect(field().value).toBe("-150.25");
    expect(saved()).toBe("-150.25");
  });
});
