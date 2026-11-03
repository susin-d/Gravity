import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { pageTitles, type PageId } from "./lib/navigation";
import { AppDataProvider, useAppData } from "./state/AppData";
import { ToastProvider } from "./components/ui/toast";
import { Banner } from "./components/ui/banner";
import { Button } from "./components/ui/button";
import { Skeleton } from "./components/ui/skeleton";
import { Titlebar } from "./components/layout/titlebar";
import { Sidebar } from "./components/layout/sidebar";
import { ChatPage } from "./pages/Chat";
import { ProfilesPage } from "./pages/Profiles";
import { ProjectsPage } from "./pages/Projects";
import { ActivityPage } from "./pages/Activity";
import { SettingsPage } from "./pages/Settings";

const pages: PageId[] = ["chat", "profiles", "projects", "activity", "settings"];

function LoadingShell() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-60 shrink-0 space-y-2 border-r border-line bg-panel p-3 max-[900px]:w-16">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function ErrorShell({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-danger-text" aria-hidden />
        <h1 className="text-base font-semibold text-ink">Gravity could not load</h1>
        <p className="mt-1 break-words text-sm text-ink-muted">{message}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function AppShell() {
  const { sessions, settings, loading, initialized, error, refresh } = useAppData();
  const [page, setPage] = useState<PageId>("chat");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;

      if (document.querySelector('[role="dialog"]')) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const index = Number(event.key);
      if (!Number.isInteger(index) || index < 1 || index > pages.length) return;

      event.preventDefault();
      setPage(pages[index - 1]);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    document.title = `${pageTitles[page]} · Gravity`;
  }, [page]);

  const runningCount = sessions.filter((session) => session.status === "running").length;

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <Titlebar />

      {!initialized && loading ? (
        <LoadingShell />
      ) : !initialized && error ? (
        <ErrorShell message={error} onRetry={() => void refresh()} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            page={page}
            onNavigate={setPage}
            runningCount={runningCount}
            autoSwitchEnabled={settings?.flags.auto_switch === true}
          />

          <main className="flex min-w-0 flex-1 flex-col">
            {error && (
              <div className="mx-auto w-full max-w-5xl px-6 pt-6">
                <Banner
                  variant="danger"
                  title="Could not refresh data"
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void refresh()}
                    >
                      Retry
                    </Button>
                  }
                >
                  {error}
                </Banner>
              </div>
            )}

            {page === "chat" ? (
              <ChatPage onNavigate={setPage} />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
                  {page === "profiles" && <ProfilesPage />}
                  {page === "projects" && <ProjectsPage />}
                  {page === "activity" && <ActivityPage onNavigate={setPage} />}
                  {page === "settings" && <SettingsPage />}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    </ToastProvider>
  );
}
