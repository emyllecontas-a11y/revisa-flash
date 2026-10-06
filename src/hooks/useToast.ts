// src/hooks/useToast.ts
import { toast } from "sonner";

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

export function useToast() {
  return {
    success: (msg: string, opts?: ToastOptions) => toast.success(msg, opts),
    error: (msg: string, opts?: ToastOptions) => toast.error(msg, opts),
    info: (msg: string, opts?: ToastOptions) => toast.info(msg, opts),
    warning: (msg: string, opts?: ToastOptions) => toast.warning(msg, opts),

    /**
     * Toast com botão "Desfazer". Útil para exclusões (soft delete).
     * O `onUndo` é chamado quando o usuário clica em Desfazer.
     */
    undoable: (
      msg: string,
      onUndo: () => void | Promise<void>,
      opts?: { description?: string; duration?: number; undoLabel?: string }
    ) =>
      toast(msg, {
        description: opts?.description,
        duration: opts?.duration ?? 6000,
        action: {
          label: opts?.undoLabel ?? "Desfazer",
          onClick: () => {
            void onUndo();
          },
        },
      }),
  };
}