import { cn } from "../../lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden
      className={cn("h-4 w-4", className)}
    >
      <path
        d="M22 84c8 15 23 25 42 25 27 0 48-21 48-48S91 13 64 13 16 34 16 61"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="m39 50 14 13-14 13M61 76h25"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 61h21"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}
