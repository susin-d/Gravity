import { Settings as SettingsIcon, Database, Terminal, Flag, Info } from "lucide-react";

export type SettingsSection = "database" | "terminal" | "flags" | "about";

interface SettingsPanelProps {
  selectedSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  autoSwitchFlag: boolean;
}

export default function SettingsPanel({
  selectedSection,
  onSelectSection,
  autoSwitchFlag,
}: SettingsPanelProps) {
  const sections = [
    { id: "database" as SettingsSection, label: "Database & Storage", icon: Database, desc: "SQLite WAL mode" },
    { id: "terminal" as SettingsSection, label: "Terminal Fallback", icon: Terminal, desc: "wt.exe & powershell" },
    { id: "flags" as SettingsSection, label: "Feature Flags", icon: Flag, desc: autoSwitchFlag ? "Auto-switch armed" : "Standard mode" },
    { id: "about" as SettingsSection, label: "About Gravity", icon: Info, desc: "Win32 + Tauri 2" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge-subtle px-3 py-2.5">
        <SettingsIcon className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">Preferences</span>
      </div>

      {/* Sections List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sections.map(({ id, label, icon: Icon, desc }) => {
          const isSelected = selectedSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectSection(id)}
              className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all ${
                isSelected
                  ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
                  : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-white" : "text-ink-low"}`} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <span className="mt-1 font-mono text-[10px] text-ink-low">
                {desc}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-edge-subtle px-3 py-2 text-[10px] text-ink-low font-mono flex justify-between">
        <span>Settings</span>
        <span>flags.toml</span>
      </div>
    </div>
  );
}
