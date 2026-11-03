import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, errorMessage, isTauriRuntime } from "../lib/api";
import type {
  AppSettings,
  Profile,
  Project,
  Session,
  UsageReading,
} from "../lib/types";

interface AppDataValue {
  profiles: Profile[];
  projects: Project[];
  sessions: Session[];
  usages: Record<string, UsageReading>;
  settings: AppSettings | null;
  terminalAvailable: boolean | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshUsage: (profileId: string) => Promise<UsageReading>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [usages, setUsages] = useState<Record<string, UsageReading>>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [terminalAvailable, setTerminalAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError(
        "The desktop backend is not available in a browser. Run `pnpm tauri dev` to start Gravity.",
      );
      setLoading(false);
      return;
    }

    if (!initializedRef.current) setLoading(true);
    try {
      const [nextProfiles, nextProjects, nextSessions, nextUsages, nextSettings, nextTerminal] =
        await Promise.all([
          api.listProfiles(),
          api.listProjects(),
          api.listSessions(),
          api.listLatestUsages(),
          api.getSettings(),
          api.checkTerminalAvailable(),
        ]);

      setProfiles(nextProfiles);
      setProjects(nextProjects);
      setSessions(nextSessions);
      setUsages(nextUsages);
      setSettings(nextSettings);
      setTerminalAvailable(nextTerminal);
      setError(null);
      setInitialized(true);
      initializedRef.current = true;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshUsage = useCallback(async (profileId: string) => {
    const reading = await api.refreshProfileUsage(profileId);
    setUsages((current) => ({ ...current, [profileId]: reading }));
    return reading;
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      profiles,
      projects,
      sessions,
      usages,
      settings,
      terminalAvailable,
      loading,
      initialized,
      error,
      refresh,
      refreshUsage,
    }),
    [
      profiles,
      projects,
      sessions,
      usages,
      settings,
      terminalAvailable,
      loading,
      initialized,
      error,
      refresh,
      refreshUsage,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return value;
}
