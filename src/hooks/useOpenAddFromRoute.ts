import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { wantsAddDialog } from '@/lib/onboarding';

/**
 * True once when the page was opened with OPEN_ADD_STATE (the Home checklist
 * does this), so the page can start with its Add dialog open. The state is
 * then cleared, so Back or a reload does not open the dialog again.
 */
export function useOpenAddFromRoute(): boolean {
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState(() => wantsAddDialog(location.state));
  useEffect(() => {
    if (wantsAddDialog(location.state)) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  return initial;
}
