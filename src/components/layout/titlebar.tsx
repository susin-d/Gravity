import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../../lib/api";
import { BrandMark } from "./brand-mark";

export function Titlebar() {
  const native = isTauriRuntime();

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel pl-3 pr-1 select-none"
    >
      <div className="pointer-events-none flex items-center gap-2 text-ink">
        <BrandMark className="h-4 w-4" />
        <span className="text-xs font-semibold tracking-wide">Gravity</span>
      </div>

      {native && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => void getCurrentWindow().minimize()}
            className="inline-flex h-8 w-11 items-center justify-center text-ink-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            aria-label="Minimize window"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void getCurrentWindow().toggleMaximize()}
            className="inline-flex h-8 w-11 items-center justify-center text-ink-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            aria-label="Toggle maximize"
            title="Maximize"
          >
            <Square className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void getCurrentWindow().close()}
            className="inline-flex h-8 w-11 items-center justify-center text-ink-muted transition-colors hover:bg-danger-bg hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            aria-label="Close window"
            title="Close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </header>
  );
}
