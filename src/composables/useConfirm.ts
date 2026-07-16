import { reactive, readonly } from "vue";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  /** Pass null for a single-button notice (replaces alert()). */
  cancelText?: string | null;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
}

interface DialogState extends Required<Omit<ConfirmOptions, "cancelText">> {
  open: boolean;
  cancelText: string | null;
}

const state = reactive<DialogState>({
  open: false,
  title: "",
  message: "",
  confirmText: "Confirmer",
  cancelText: "Annuler",
  danger: false,
});

let resolver: ((ok: boolean) => void) | undefined;

function settle(ok: boolean) {
  if (!state.open) return;
  state.open = false;
  const r = resolver;
  resolver = undefined;
  r?.(ok);
}

/**
 * App-themed replacement for window.confirm / window.alert, which render an
 * OS dialog that clashes with the app. Backed by a single host mounted in
 * App.vue; `confirm()` resolves to true/false.
 */
export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    // A second call while one is open supersedes it (the first resolves false).
    settle(false);
    state.title = opts.title;
    state.message = opts.message ?? "";
    state.confirmText = opts.confirmText ?? "Confirmer";
    state.cancelText = opts.cancelText === undefined ? "Annuler" : opts.cancelText;
    state.danger = opts.danger ?? false;
    state.open = true;
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  return { confirm };
}

/** Internal — used only by the ConfirmDialog host. */
export function useConfirmState() {
  return {
    state: readonly(state),
    accept: () => settle(true),
    cancel: () => settle(false),
  };
}
