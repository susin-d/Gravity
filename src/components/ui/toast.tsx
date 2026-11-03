import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastRecord extends ToastInput {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const accents: Record<ToastVariant, string> = {
  success: "text-success-text",
  error: "text-danger-text",
  info: "text-info-text",
};

function ToastCard({
  record,
  onDismiss,
}: {
  record: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const Icon = icons[record.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(record.id), 6000);
    return () => window.clearTimeout(timer);
  }, [record.id, onDismiss]);

  return (
    <div
      role={record.variant === "error" ? "alert" : "status"}
      className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3 shadow-2xl"
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", accents[record.variant])}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-ink">{record.title}</p>
        {record.description && (
          <p className="break-words text-xs text-ink-muted">{record.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(record.id)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-dim transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setRecords((current) => current.filter((record) => record.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    const variant = input.variant ?? "info";
    const key = `${variant}::${input.title}::${input.description ?? ""}`;
    setRecords((current) =>
      [
        // Identical toast already on screen: replace it instead of stacking a copy.
        ...current.filter(
          (record) => `${record.variant}::${record.title}::${record.description ?? ""}` !== key,
        ),
        { ...input, id, variant },
      ].slice(-3),
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {records.map((record) => (
          <div key={record.id} className="pointer-events-auto">
            <ToastCard record={record} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return value;
}
