import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-gravity-400",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gravity-600 text-white shadow",
        secondary:
          "border-border-subtle bg-surface-2 text-text-secondary",
        destructive:
          "border-red-800/80 bg-red-950/60 text-red-300",
        outline: "text-text-primary border-border",
        success:
          "border-emerald-800/80 bg-emerald-950/60 text-emerald-300",
        warning:
          "border-amber-800/80 bg-amber-950/60 text-amber-300",
        info:
          "border-sky-800/80 bg-sky-950/60 text-sky-300",
        neutral:
          "border-border bg-surface-2 text-text-tertiary",
        claude:
          "border-orange-800/80 bg-orange-950/50 text-orange-300",
        codex:
          "border-emerald-800/80 bg-emerald-950/50 text-emerald-300",
        personal:
          "border-sky-800/80 bg-sky-950/50 text-sky-300",
        work:
          "border-purple-800/80 bg-purple-950/50 text-purple-300",
        client:
          "border-amber-800/80 bg-amber-950/50 text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
