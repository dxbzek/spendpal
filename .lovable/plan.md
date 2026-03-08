

## Add Tooltips to Budget Method Simulation

Each simulation button already has data in `METHOD_LABELS` with a `desc` field. I'll wrap each simulation button with a `Tooltip` that shows a short explanation of the budgeting method on hover/tap.

### Changes

**`src/pages/AIAdvisor.tsx`**:
- Import `Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip`
- Wrap each simulation `<button>` inside `<Tooltip>` + `<TooltipTrigger asChild>` / `<TooltipContent>` using the existing `METHOD_LABELS[sim.key].desc` text for the tooltip content

This is a small, focused change — no new data needed since descriptions already exist in `METHOD_LABELS`.

