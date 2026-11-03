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
  launchProjectId: string | null;
  launchProfileId: string | null;
  setLaunchProject: (id: string | null) => void;
  setLaunchProfile: (id: string | null) => void;
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
  const [launchProjectId, setLaunchProjectId] = useState<string | null>(null);
  const [launchProfileId, setLaunchProfileId] = useState<string | null>(null);

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

      setLaunchProjectId((current) =>
        nextProjects.some((project) => project.id === current) ? current : null,
      );
      setLaunchProfileId((current) =>
        nextProfiles.some((profile) => profile.id === current)
          ? current
          : (nextProfiles[0]?.id ?? null),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLaunchProject = useCallback(
    (id: string | null) => {
      setLaunchProjectId(id);
      const project = projects.find((candidate) => candidate.id === id);
      if (project?.default_profile_id) {
        setLaunchProfileId(project.default_profile_id);
      }
    },
    [projects],
  );

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
      launchProjectId,
      launchProfileId,
      setLaunchProject,
      setLaunchProfile: setLaunchProfileId,
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
      launchProjectId,
      launchProfileId,
      setLaunchProject,
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
