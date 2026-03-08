

## End-to-End Testing & Optimization Plan

### Issues Found

**1. Layout locked to mobile width on tablet/desktop**
- `AppLayout` has `max-w-lg` (512px), making the app a narrow strip on tablets and desktops. The Tailwind container is also capped at `480px`. This needs a responsive approach: mobile-first narrow layout, wider on tablet (md), and a proper desktop layout (lg+).

**2. Bottom nav with 6 items (5 + FAB) is cramped on small screens**
- 5 nav items plus a center FAB creates tight spacing. The text labels at `9px` are barely readable. On tablet/desktop, the bottom nav should become a sidebar or wider bar.

**3. Edit/Delete buttons invisible on mobile (Budgets & Goals pages)**
- Budgets page (line 80-81) and Goals page (line 98-99) still use `opacity-0 group-hover:opacity-100` without the `md:` prefix fix applied to Dashboard. These are inaccessible on touch devices.

**4. No responsive adaptation for tablet/desktop**
- All pages use `px-5` fixed padding. No grid layouts for wider screens. Dashboard cards, budget cards, and goal cards should use 2-column grids on tablet and 3-column on desktop.

**5. Auth page separator has no vertical margin**
- The "or" separator between Google sign-in and email form (line 79-83) has no `my-*` spacing, causing it to stack directly against elements above/below.

**6. Settings page missing padding-top on mobile**
- Settings has `pt-6` while other pages use `pt-12`, making it feel cramped under the status bar area.

**7. Dashboard header Settings icon is redundant**
- Settings is now in the bottom nav, so the gear icon in the Dashboard header is redundant. Remove it to clean up the header.

### Proposed Fixes

**A. Responsive Layout System (AppLayout + BottomNav)**
- Change `max-w-lg` to `max-w-lg md:max-w-2xl lg:max-w-5xl` in AppLayout
- On `lg:` screens, convert bottom nav to a left sidebar
- Alternatively, keep bottom nav but widen the content area with proper padding

**B. Fix hover-only buttons across all pages**
- Budgets.tsx: Change `opacity-0 group-hover:opacity-100` to always-visible on mobile (`md:opacity-0 md:group-hover:opacity-100`)
- Goals.tsx: Same fix for Edit/Delete buttons

**C. Responsive card grids**
- Dashboard: `grid-cols-1 md:grid-cols-2` for account cards, charts, etc.
- Budgets: `grid md:grid-cols-2` for budget cards
- Goals: `grid md:grid-cols-2` for goal cards
- Transactions: wider transaction rows on desktop

**D. Minor UI polish**
- Auth page: Add `my-4` to separator section
- Settings: Change `pt-6` to `pt-12` for consistency
- Remove redundant Settings icon from Dashboard header
- Increase bottom nav label font size slightly on wider screens

### Files to Edit

1. **`src/components/layout/AppLayout.tsx`** -- Responsive max-width
2. **`src/components/layout/BottomNav.tsx`** -- Responsive nav sizing, hide on lg for sidebar
3. **`src/pages/Dashboard.tsx`** -- Remove redundant Settings icon, responsive grids, responsive card layouts
4. **`src/pages/Budgets.tsx`** -- Fix hover buttons, responsive grid
5. **`src/pages/Goals.tsx`** -- Fix hover buttons, responsive grid
6. **`src/pages/Transactions.tsx`** -- Responsive layout for wider screens
7. **`src/pages/Settings.tsx`** -- Fix top padding
8. **`src/pages/AuthPage.tsx`** -- Fix separator spacing

