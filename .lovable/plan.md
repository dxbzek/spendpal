

## Design Audit: White + Green Only Theme

### Current Issues Found

1. **Goals page header** (`gradient-goals`): Uses purple-pink gradient (`hsl(270, 60%, 55%)` to `hsl(330, 70%, 55%)`) -- needs to use green gradient
2. **Goal progress bars**: Use `gradient-goals` class (purple-pink)
3. **Warning color** (`--warning`): Orange `hsl(38, 92%, 50%)` used in budget percentage badges
4. **Expense/destructive color** (`--expense`, `--destructive`): Red -- needs to become a darker/muted green or stay as a subtle contrast within the green palette
5. **Pie chart**: 8 different colors (orange, purple, blue, red, pink, teal, yellow)
6. **Monthly trend chart**: Expense line is red `hsl(0, 72%, 55%)`
7. **CSS variables**: Multiple non-green accent colors defined in `index.css`

### Plan

#### 1. Update CSS variables in `src/index.css`
- Change `--warning` from orange to a lighter green tone
- Change `--destructive` and `--expense` to a muted/dark shade (e.g., a desaturated dark green or gray-green) so negative values still contrast but stay in the green-white palette
- Change `--income` to match primary green
- Update `--gradient-goals` to use green tones instead of purple-pink (reuse `--gradient-primary` or a slightly different green gradient)
- Keep `--accent` and `--accent-foreground` green-tinted as they already are

#### 2. Update `SpendingPieChart.tsx`
- Replace the 8-color palette with shades of green (from dark to light green tints)

#### 3. Update `MonthlyTrendChart.tsx`
- Change expense line from red to a lighter/darker green shade to differentiate from income line

#### 4. Update `Goals.tsx`
- Replace `gradient-goals` usage with `gradient-primary` (green gradient)

#### 5. Update `Budgets.tsx`
- Budget warning badges: replace orange/red color references with green shades
- Progress bars: already use `bg-primary` (green) for normal state; change `bg-expense` and `bg-warning` overflow states to darker green

#### 6. Update `BottomNav.tsx` -- no changes needed (already uses primary green)

#### 7. Update `AuthPage.tsx` -- no changes needed (already white + green)

#### 8. Update `Settings.tsx` -- sign out button uses `text-destructive`; change to a muted green or gray

### Color Palette (all green + white)
- Primary green: `hsl(152, 62%, 42%)` (existing)
- Dark green: `hsl(152, 60%, 28%)` for "negative" indicators
- Light green: `hsl(152, 40%, 85%)` for muted states
- Pie chart: 6-8 green shades from `hsl(140, 50%, 30%)` to `hsl(165, 40%, 80%)`

