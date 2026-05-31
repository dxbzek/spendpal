import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_UNDO_DELAY_MS = 5000;

export interface UseUndoableDeleteOptions {
  /** Delete a single entity. Errors should be surfaced by the deleter itself. */
  deleteOne: (id: string) => unknown | Promise<unknown>;
  /** Optional batch delete; when absent, batches fall back to deleteOne per id. */
  deleteMany?: (ids: string[]) => unknown | Promise<unknown>;
  /** How long the Undo window stays open (ms). */
  delayMs?: number;
}

export interface UndoableDelete {
  /** Ids currently scheduled for deletion — filter these out of the rendered list. */
  pendingDeleteIds: Set<string>;
  isPending: (id: string) => boolean;
  /** Schedule a batch of ids for deletion after the Undo window, with a toast. */
  scheduleDelete: (ids: string[], label: string) => void;
}

/**
 * Reusable "delete with a 5s Undo toast" behavior, generalized from the
 * Transactions page so accounts / budgets / goals / installments can share it.
 * A single timer is shared across the batch so linked rows (e.g. a transfer
 * pair) delete together and Undo cancels them together.
 */
export function useUndoableDelete({
  deleteOne,
  deleteMany,
  delayMs = DEFAULT_UNDO_DELAY_MS,
}: UseUndoableDeleteOptions): UndoableDelete {
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep the latest deleters in refs so scheduleDelete keeps a stable identity.
  const deleteOneRef = useRef(deleteOne);
  const deleteManyRef = useRef(deleteMany);
  useEffect(() => {
    deleteOneRef.current = deleteOne;
    deleteManyRef.current = deleteMany;
  });

  // Flush all pending timers on unmount.
  useEffect(
    () => () => {
      pendingTimers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const scheduleDelete = useCallback(
    (ids: string[], label: string) => {
      if (ids.length === 0) return;
      ids.forEach((id) => {
        const existing = pendingTimers.current.get(id);
        if (existing) clearTimeout(existing);
      });
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });

      const timer = setTimeout(async () => {
        try {
          if (ids.length > 1 && deleteManyRef.current) {
            await deleteManyRef.current(ids);
          } else {
            for (const id of ids) await deleteOneRef.current(id);
          }
        } catch {
          /* errors are surfaced by the deleters themselves */
        } finally {
          setPendingDeleteIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          ids.forEach((id) => pendingTimers.current.delete(id));
        }
      }, delayMs);

      // Store the same timer under each id so Undo can cancel the whole batch.
      ids.forEach((id) => pendingTimers.current.set(id, timer));

      toast(label, {
        duration: delayMs,
        action: {
          label: "Undo",
          onClick: () => {
            ids.forEach((id) => {
              const t = pendingTimers.current.get(id);
              if (t) {
                clearTimeout(t);
                pendingTimers.current.delete(id);
              }
            });
            setPendingDeleteIds((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            });
          },
        },
      });
    },
    [delayMs],
  );

  const isPending = useCallback((id: string) => pendingDeleteIds.has(id), [pendingDeleteIds]);

  return { pendingDeleteIds, isPending, scheduleDelete };
}
