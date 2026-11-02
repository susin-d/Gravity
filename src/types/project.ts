export interface Project {
  id: string;
  path: string;
  name: string;
  tag: "personal" | "work" | "client";
  auto_switch_enabled: number;
  default_profile_id?: string;
  terminal: string;
  created_at: string;
  updated_at: string;
}
