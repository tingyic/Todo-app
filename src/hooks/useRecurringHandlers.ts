import { useRef, useState } from "react";
import type { Todo } from "../types";
import type { SoundName } from "../utils/sound";

export function useRecurringHandlers(params: {
  todo: Todo;
  onToggle: (id: string, createNext?: boolean | null) => void;
  onUpdate: (id: string, patch: Partial<Todo>, toastMsg?: string) => void;
  play?: (name: SoundName, doHaptic?: boolean) => void;
  showToast?: (msg: string, ms?: number) => void;
}) {
  const noopPlay = () => {};
  const { todo, onToggle, onUpdate, play = noopPlay, showToast } = params;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const originalSubtasksRef = useRef<Todo["subtasks"] | null>(null);
  const originalDoneRef = useRef<boolean | null>(null);
  const provisionalRef = useRef(false);

  function openRecurringConfirmAndMarkSubs() {
    if (provisionalRef.current) return;

    originalSubtasksRef.current = (todo.subtasks ?? []).map(s => ({ ...s }));
    originalDoneRef.current = !!todo.done;
    provisionalRef.current = true;
    setConfirmOpen(true);

    if ((todo.subtasks ?? []).length) {
      const allDoneSubs = (todo.subtasks ?? []).map(s => ({ ...s, done: true }));
      onUpdate(todo.id, { subtasks: allDoneSubs }, "Subtasks marked done");
    }
  }

  function restoreAndCancelConfirm() {
    onUpdate(todo.id, {
      subtasks: originalSubtasksRef.current ?? undefined,
      done: false,
    }, "Cancelled, subtasks restored");

    originalSubtasksRef.current = null;
    originalDoneRef.current = null;
    provisionalRef.current = false;
    setConfirmOpen(false);
    play("click");
  }

  function cleanupAfterConfirm() {
    setConfirmOpen(false);
    provisionalRef.current = false;
    originalSubtasksRef.current = null;
    originalDoneRef.current = null;
  }

  function confirmCreateNext() {
    cleanupAfterConfirm();
    onToggle(todo.id, true);
    play("done", true);
  }

  function confirmMarkDonePermanently() {
    cleanupAfterConfirm();
    onToggle(todo.id, false);
    play("done", true);
  }

  function handleToggleFromView() {
    // If toggling from done -> undone, just toggle
    if (todo.done) {
      onToggle(todo.id);
      play("undo", true);
      return;
    }

    // If not recurring, just toggle and show toast
    if (!todo.recurrence) {
      const wasDone = todo.done;
      onToggle(todo.id);
      if (!wasDone) {
        play("done", true);
        if (showToast) showToast("Yayyyyy lesgoooo task completed weeeee 🎉", 1400);
      } else {
        play("done", true);
        if (showToast) showToast("Marked done", 900);
      }
      return;
    }

    openRecurringConfirmAndMarkSubs();
  }

  return {
    confirmOpen,
    setConfirmOpen,
    openRecurringConfirmAndMarkSubs,
    restoreAndCancelConfirm,
    confirmCreateNext,
    confirmMarkDonePermanently,
    handleToggleFromView,
    _internal: { originalSubtasksRef, originalDoneRef, provisionalRef },
  };
}
