import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-35 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-glass-2 text-white border border-edge-DEFAULT hover:bg-glass-4 hover:border-edge-strong active:bg-glass-3 hover:shadow-glow-sm",
        destructive:
          "bg-red-950/20 text-red-300 border border-red-800/50 hover:bg-red-950/40 active:bg-red-950/60",
        outline:
          "border border-edge-DEFAULT bg-transparent text-white hover:bg-glass-2",
        secondary:
          "bg-glass-2 text-ink-high border border-edge-subtle hover:bg-glass-3 hover:border-edge-DEFAULT hover:text-white",
        ghost:
          "text-ink-mid hover:bg-glass-2 hover:text-white",
        link: "text-white underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-[11px]",
        lg: "h-10 rounded-lg px-8 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
