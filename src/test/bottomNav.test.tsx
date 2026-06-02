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
});
