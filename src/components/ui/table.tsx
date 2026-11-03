import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function TableShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-line bg-panel",
        className,
      )}
      {...props}
    />
  );
}

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full border-collapse text-left text-sm", className)}
      {...props}
    />
  );
}

export const tableHeadRow =
  "border-b border-line bg-raised/60 text-[11px] uppercase tracking-wide text-ink-dim";

export const tableRow =
  "border-b border-line/70 last:border-b-0 transition-colors hover:bg-raised/50";

export const th = "px-4 py-2.5 font-medium";

export const td = "px-4 py-2.5 align-middle";
