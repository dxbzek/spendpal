import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "@/components/layout/BottomNav";

const renderNav = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <BottomNav onAddClick={() => {}} />
    </MemoryRouter>,
  );

describe("BottomNav More menu", () => {
  it("opens when tapping More and closes when tapping the X", async () => {
    renderNav();

    // Menu is closed initially.
    expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull();

    // Tap "More".
    fireEvent.click(screen.getByRole("button", { name: /more/i }));

    // Panel is open: a menu item and the close button are present.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /close menu/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("Accounts")).toBeInTheDocument();

    // Tap the X — the menu must close.
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull(),
    );
  });

  it("closes when tapping a menu item", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    await waitFor(() => expect(screen.getByText("Reports")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Reports"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull(),
    );
  });

  it("has five slots: Home, Txns, +, Budgets, More; the rest is in More", async () => {
    renderNav();
    const bar = screen.getByRole("navigation", { name: /main navigation/i });
    expect(bar.querySelectorAll("button")).toHaveLength(5);
    for (const label of ["Home", "Txns", "Budgets", "More"]) {
      expect(bar).toHaveTextContent(label);
    }
    for (const label of ["Installments", "Goals", "Advisor"]) {
      expect(bar).not.toHaveTextContent(label);
    }

    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    const sheet = await screen.findByRole("dialog", { name: /more/i });
    for (const label of ["Installments", "Goals", "Advisor"]) {
      expect(sheet).toHaveTextContent(label);
    }
    expect(sheet).not.toHaveTextContent("Budgets");
  });

  it("removes the sheet as soon as it closes, without waiting on an animation", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByRole("dialog", { name: /more/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    // Synchronously gone: no exit animation that could stall and leave it on screen.
    expect(screen.queryByRole("dialog", { name: /more/i })).toBeNull();
  });
});
