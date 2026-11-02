import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import Titlebar from "./components/layout/Titlebar";
import ActivityRail, { NavTab } from "./components/layout/ActivityRail";
import SecondarySidebar from "./components/layout/SecondarySidebar";
import WorkspaceView from "./pages/WorkspaceView";
import Projects, { Project } from "./pages/Projects";
import Profiles, { Profile, Session } from "./pages/Profiles";
import AdapterHealth from "./pages/AdapterHealth";
import AutoSwitchConsent from "./pages/AutoSwitchConsent";
import Settings from "./pages/Settings";
import History from "./pages/History";
import { UsageReading } from "./components/UsageBadge";
import { SettingsSection } from "./components/layout/panels/SettingsPanel";

interface AppSettings {
  flags: { auto_switch: boolean };
}

export default function App() {
  const [navHistory, setNavHistory] = useState<NavTab[]>(["workspace"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usages, setUsages] = useState<Record<string, UsageReading>>({});
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedAdapter, setSelectedAdapter] = useState<"claude" | "codex" | null>(null);
  const [selectedSettingsSection, setSelectedSettingsSection] =
    useState<SettingsSection>("database");

  const [autoSwitchFlag, setAutoSwitchFlag] = useState(false);

  const activeTab = navHistory[historyIndex] || "workspace";

  const navigateTo = useCallback((tab: NavTab) => {
    setNavHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, tab];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleGoBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
    }
  }, [historyIndex]);

  const handleGoForward = useCallback(() => {
    if (historyIndex < navHistory.length - 1) {
      setHistoryIndex((prev) => prev + 1);
    }
  }, [historyIndex, navHistory.length]);

  const refreshData = useCallback(async () => {
    try {
      const [projList, profList, settings, latestUsages, sessions] = await Promise.all([
        invoke<Project[]>("list_projects").catch(() => []),
        invoke<Profile[]>("list_profiles").catch(() => []),
        invoke<AppSettings>("get_settings").catch(() => ({ flags: { auto_switch: false } })),
        invoke<Record<string, UsageReading>>("list_latest_usages").catch(() => ({})),
        invoke<Session[]>("list_sessions").catch(() => []),
      ]);

      setProjects(projList);
      setProfiles(profList);
      setAutoSwitchFlag(settings.flags.auto_switch);
      setUsages(latestUsages);
      setActiveSessions(sessions);

      // Default active project
      if (projList.length > 0) {
        setActiveProjectId((curr) => curr || projList[0].id);
      }

      // Default active profile
      if (profList.length > 0) {
        setActiveProfileId((curr) => curr || profList[0].id);
      }
    } catch (e) {
      console.debug("Failed refreshing app data", e);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Keyboard shortcuts advertised by the titlebar menus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        navigateTo("workspace");
      } else if (key === "p") {
        e.preventDefault();
        navigateTo("projects");
      } else if (key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateTo]);

  // Keep active profile synced with active project's default if project changes
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ||
    profiles.find((p) => p.id === activeProject?.default_profile_id) ||
    profiles[0] ||
    null;

  const currentUsage = activeProfile ? usages[activeProfile.id] : null;

  const getProfileInitials = (name?: string) => {
    if (!name) return "SR";
    const parts = name.trim().split(/[\s_-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleRailTabClick = useCallback(
    (tab: NavTab) => {
      if (tab === activeTab) {
        setSidebarOpen((prev) => !prev);
      } else {
        setSidebarOpen(true);
        navigateTo(tab);
      }
    },
    [activeTab, navigateTo]
  );

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d0d0d] text-ink-high antialiased select-none"
      style={{
        backgroundImage: "radial-gradient(ellipse at 50% 35%, #151515 0%, #070707 75%)",
      }}
    >
      {/* ── Top Custom Window Titlebar ───────────────────────────────────────── */}
      <Titlebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < navHistory.length - 1}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onNewSession={() => navigateTo("workspace")}
        autoSwitchArmed={autoSwitchFlag}
        activeProfileName={activeProfile?.label}
        onSelectPage={(tab) => navigateTo(tab as NavTab)}
      />

      {/* ── Application Body (Activity Rail + Secondary Sidebar + Main Workspace) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Leftmost Activity Rail */}
        <ActivityRail
          activeTab={activeTab}
          onSelectTab={handleRailTabClick}
          autoSwitchFlag={autoSwitchFlag}
          activeProfileInitials={getProfileInitials(activeProfile?.label)}
          activeProfileName={activeProfile?.label}
          activeProfileVendor={activeProfile?.vendor}
        />

        {/* Collapsible Secondary Sidebar */}
        <SecondarySidebar
          isOpen={sidebarOpen}
          activeTab={activeTab}
          projects={projects}
          profiles={profiles}
          usages={usages}
          activeProjectId={activeProjectId}
          activeProfileId={activeProfileId}
          selectedEventId={selectedEventId}
          selectedAdapter={selectedAdapter}
          selectedSettingsSection={selectedSettingsSection}
          autoSwitchFlag={autoSwitchFlag}
          onSelectProject={(id) => {
            setActiveProjectId(id);
            if (activeTab !== "workspace") {
              navigateTo("workspace");
            }
          }}
          onSelectProfile={setActiveProfileId}
          onSelectEvent={setSelectedEventId}
          onSelectAdapter={setSelectedAdapter}
          onSelectSettingsSection={setSelectedSettingsSection}
          onNewSession={() => navigateTo("workspace")}
          onOpenCreateProject={() => navigateTo("projects")}
        />

        {/* Center Main Workspace */}
        <main className="flex-1 min-w-0 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.995 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full w-full"
            >
              {activeTab === "workspace" && (
                <WorkspaceView
                  activeProject={activeProject}
                  activeProfile={activeProfile}
                  profiles={profiles}
                  usageReading={currentUsage}
                  activeSessions={activeSessions}
                  onSelectProfile={setActiveProfileId}
                  onOpenCreateProject={() => navigateTo("projects")}
                  onSelectProjectName={() => navigateTo("projects")}
                  onSessionSpawned={(session) => {
                    setActiveSessions((prev) => [session, ...prev]);
                    refreshData();
                  }}
                />
              )}
              {activeTab === "projects" && (
                <Projects
                  selectedProjectId={activeProjectId}
                  onSelectProject={(id) => {
                    setActiveProjectId(id);
                    navigateTo("workspace");
                  }}
                />
              )}
              {activeTab === "profiles" && (
                <Profiles
                  selectedProfileId={activeProfileId}
                  onSelectProfile={setActiveProfileId}
                />
              )}
              {activeTab === "adapters" && (
                <AdapterHealth selectedAdapter={selectedAdapter} />
              )}
              {activeTab === "autoswitch" && <AutoSwitchConsent />}
              {activeTab === "settings" && (
                <Settings selectedSection={selectedSettingsSection} />
              )}
              {activeTab === "history" && (
                <History
                  selectedEventId={selectedEventId}
                  onSelectEvent={setSelectedEventId}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
