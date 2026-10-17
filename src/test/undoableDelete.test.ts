import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';

vi.mock('sonner', () => ({ toast: vi.fn() }));

afterEach(() => vi.useRealTimers());

describe('useUndoableDelete', () => {
  it('deletes after the undo window', async () => {
    vi.useFakeTimers();
    const deleteOne = vi.fn();
    const { result } = renderHook(() => useUndoableDelete({ deleteOne, delayMs: 1000 }));
    act(() => result.current.scheduleDelete(['a'], 'Deleted'));
    expect(result.current.isPending('a')).toBe(true);
    expect(deleteOne).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(deleteOne).toHaveBeenCalledWith('a');
  });

  it('still deletes when the page unmounts inside the undo window', () => {
    vi.useFakeTimers();
    const deleteOne = vi.fn();
    const deleteMany = vi.fn();
    const { result, unmount } = renderHook(() => useUndoableDelete({ deleteOne, deleteMany, delayMs: 5000 }));
    act(() => result.current.scheduleDelete(['a', 'b'], 'Transfer deleted'));
    unmount();
    expect(deleteMany).toHaveBeenCalledWith(['a', 'b']);
    vi.advanceTimersByTime(5000);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});
