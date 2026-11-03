import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

export const inputClassName =
  "h-9 w-full rounded-sm border border-line bg-canvas px-2.5 text-sm text-ink placeholder:text-ink-dim transition-colors focus-visible:border-line-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink/30 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClassName, className)} {...props} />
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(inputClassName, "cursor-pointer pr-8", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-xs text-ink-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
