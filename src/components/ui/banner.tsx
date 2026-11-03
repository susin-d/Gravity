import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type BannerVariant = "info" | "success" | "warning" | "danger";

const styles: Record<BannerVariant, string> = {
  info: "border-info-border bg-info-bg text-info-text",
  success: "border-success-border bg-success-bg text-success-text",
  warning: "border-warning-border bg-warning-bg text-warning-text",
  danger: "border-danger-border bg-danger-bg text-danger-text",
};

const icons: Record<BannerVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface BannerProps {
  variant?: BannerVariant;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function Banner({
  variant = "info",
  title,
  children,
  action,
}: BannerProps) {
  const Icon = icons[variant];

  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
        styles[variant],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
