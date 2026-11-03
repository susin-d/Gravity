import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeftRight,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Square,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatRelative, vendorLabel } from "../lib/format";
import {
  formatTokens,
  parseChatMeta,
  permissionModeLabel,
  permissionModes,
} from "../lib/chat";
import type {
  AdaptersHealthReport,
  Chat,
  ChatDetail,
  ChatMessage,
  ChatToolRecord,
  Profile,
} from "../lib/types";
import type { PageId } from "../lib/navigation";
import { cn } from "../lib/utils";
import { useChatStream } from "../lib/use-chat-stream";
import { useAppData } from "../state/AppData";
import {
  Badge,
  vendorBadgeVariant,
} from "../components/ui/badge";
import { Banner } from "../components/ui/banner";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { Select } from "../components/ui/field";
import { Skeleton, SkeletonRows } from "../components/ui/skeleton";
import { Switch } from "../components/ui/switch";
import { useToast } from "../components/ui/toast";
import { ClientBoundaryModal } from "../components/client-boundary-modal";
import { NewChatDialog } from "../components/chat/new-chat-dialog";
import { SwitchAccountDialog } from "../components/chat/switch-account-dialog";

export interface ChatPageProps {
  onNavigate: (page: PageId) => void;
}

export function ChatPage({ onNavigate }: ChatPageProps) {
  const { profiles, projects } = useAppData();
  const { toast } = useToast();

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  const [capabilities, setCapabilities] = useState<AdaptersHealthReport | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [pendingClientProfile, setPendingClientProfile] =
    useState<Profile | null>(null);
  const [switchingClient, setSwitchingClient] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(
    async (preferredId?: string) => {
      try {
        const next = await api.listChats();
        setChats(next);
        setSelectedId((current) => {
          const candidate = preferredId ?? current;
          if (candidate && next.some((chat) => chat.id === candidate)) {
            return candidate;
          }
          return next[0]?.id ?? null;
        });
      } catch (cause) {
        toast({
          variant: "error",
          title: "Could not load chats",
          description: errorMessage(cause),
        });
      } finally {
        setLoadingChats(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadChats();
    api
      .checkAdaptersHealth()
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, [loadChats]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let active = true;
    setLoadingDetail(true);
    api
      .getChat(selectedId)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((cause) => {
        if (active) {
          toast({
            variant: "error",
            title: "Could not open the chat",
            description: errorMessage(cause),
          });
        }
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId, detailVersion, toast]);

  const handleFinished = useCallback(() => {
    setDetailVersion((version) => version + 1);
    void loadChats();
  }, [loadChats]);

  const stream = useChatStream({ chatId: selectedId, onFinished: handleFinished });

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [detail, stream.state.text, stream.state.tools, stream.state.streaming]);

  const profileName = useCallback(
    (profileId: string) =>
      profiles.find((profile) => profile.id === profileId)?.label ??
      "Removed profile",
    [profiles],
  );

  async function handleSend() {
    const content = composer.trim();
    if (!content || !detail || stream.state.streaming) return;

    setComposer("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      chat_id: detail.chat.id,
      role: "user",
      content,
      meta: null,
      created_at: new Date().toISOString(),
    };
    setDetail((current) =>
      current
        ? { ...current, messages: [...current.messages, optimistic] }
        : current,
    );

    const started = await stream.send(content);
    if (!started) {
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) => message.id !== optimistic.id,
              ),
            }
          : current,
      );
      setComposer(content);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function applyChat(chat: Chat) {
    setDetail((current) => (current ? { ...current, chat } : current));
    setChats((current) =>
      current.map((item) => (item.id === chat.id ? chat : item)),
    );
  }

  async function handleUpdateChat(patch: {
    permission_mode?: string;
    carry_context?: boolean;
  }) {
    if (!detail) return;
    setSavingChat(true);
    try {
      applyChat(await api.updateChat(detail.chat.id, patch));
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not update the chat",
        description: errorMessage(cause),
      });
    } finally {
      setSavingChat(false);
    }
  }

  async function handleClientSwitch(profile: Profile) {
    if (!detail) return;
    setSwitchingClient(true);
    try {
      applyChat(await api.switchChatProfile(detail.chat.id, profile.id, true));
      setPendingClientProfile(null);
      toast({
        variant: "success",
        title: "Account switched",
        description: `Next message runs on ${profile.label}.`,
      });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not switch the account",
        description: errorMessage(cause),
      });
    } finally {
      setSwitchingClient(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteChat(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await loadChats();
      toast({ variant: "success", title: "Chat removed" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not remove the chat",
        description: errorMessage(cause),
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleCreated(chat: Chat) {
    setChats((current) => [chat, ...current]);
    setSelectedId(chat.id);
    setDetail({ chat, messages: [] });
  }

  const capability =
    detail === null || capabilities === null
      ? null
      : detail.chat.vendor === "claude"
        ? capabilities.claude_chat
        : capabilities.codex_chat;
  const vendor = detail?.chat.vendor ?? "claude";
  const modes = permissionModes[vendor];

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel/40">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquare className="h-4 w-4 text-ink-muted" aria-hidden />
            Chats
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialogOpen(true)}
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {loadingChats ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : chats.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-dim">
              No chats yet.
            </p>
          ) : (
            chats.map((chat) => {
              const active = chat.id === selectedId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedId(chat.id)}
                  aria-current={active ? "page" : undefined}
                  title={chat.title}
                  className={cn(
                    "w-full rounded px-2.5 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                    active
                      ? "bg-raised"
                      : "hover:bg-raised/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-ink">
                      {chat.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-dim">
                      {formatRelative(chat.updated_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge variant={vendorBadgeVariant(chat.vendor)}>
                      {vendorLabel(chat.vendor)}
                    </Badge>
                    <span className="truncate text-[11px] text-ink-dim">
                      {profileName(chat.profile_id)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {detail === null ? (
          <div className="flex flex-1 items-center justify-center p-6">
            {loadingDetail ? (
              <SkeletonRows rows={4} />
            ) : profiles.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Create your first profile"
                description="A profile binds a vendor, a boundary tag, and its own config directory. Gravity passes only that profile's environment to the CLI."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate("profiles")}
                  >
                    Open Profiles
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Start a conversation"
                description="Chat with Claude Code or Codex without leaving Gravity. Accounts can be switched mid-conversation."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    New chat
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <>
            <header className="border-b border-line px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-ink">
                    {detail.chat.title}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={vendorBadgeVariant(detail.chat.vendor)}>
                      {vendorLabel(detail.chat.vendor)}
                    </Badge>
                    <Badge variant="neutral">
                      {profileName(detail.chat.profile_id)}
                    </Badge>
                    {detail.chat.project_id && (
                      <Badge variant="neutral">
                        {projects.find(
                          (project) => project.id === detail.chat.project_id,
                        )?.name ?? "Removed project"}
                      </Badge>
                    )}
                    <span className="text-[11px] text-ink-dim">
                      Updated {formatRelative(detail.chat.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={stream.state.streaming}
                    onClick={() => setSwitchOpen(true)}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                    Switch account
                  </Button>

                  <Select
                    aria-label="Permission mode"
                    className="h-8 w-40 text-xs"
                    value={detail.chat.permission_mode}
                    disabled={stream.state.streaming || savingChat}
                    onChange={(event) =>
                      void handleUpdateChat({
                        permission_mode: event.target.value,
                      })
                    }
                  >
                    {modes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </Select>

                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="max-[1100px]:hidden">Carry context</span>
                    <Switch
                      checked={detail.chat.carry_context}
                      disabled={stream.state.streaming || savingChat}
                      onCheckedChange={(checked) =>
                        void handleUpdateChat({ carry_context: checked })
                      }
                      aria-label="Carry context across account switches"
                    />
                  </label>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(detail.chat)}
                    aria-label="Delete chat"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
              <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-5">
                {capability && !capability.available && (
                  <Banner variant="warning" title="CLI not found">
                    {capability.detail}. Install the{" "}
                    {vendorLabel(detail.chat.vendor)} CLI and restart Gravity
                    before sending a message.
                  </Banner>
                )}

                {stream.state.notice && (
                  <Banner
                    variant="info"
                    title={stream.state.notice.title}
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={stream.dismiss}
                        aria-label="Dismiss notice"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    }
                  >
                    {stream.state.notice.detail}
                  </Banner>
                )}

                {stream.state.error && (
                  <Banner
                    variant="danger"
                    title="Turn failed"
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={stream.dismiss}
                        aria-label="Dismiss error"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    }
                  >
                    {stream.state.error}
                  </Banner>
                )}

                {detail.messages.length === 0 && !stream.state.streaming && (
                  <div className="py-10 text-center">
                    <p className="text-sm text-ink-muted">
                      This chat is empty. Ask {vendorLabel(detail.chat.vendor)}{" "}
                      anything about the project.
                    </p>
                    <p className="mt-1 text-xs text-ink-dim">
                      Current mode: {permissionModeLabel(vendor, detail.chat.permission_mode)}
                    </p>
                  </div>
                )}

                {detail.messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="ml-auto max-w-[80%]">
                      <div className="whitespace-pre-wrap break-words rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink">
                        {message.content}
                      </div>
                      <p className="mt-1 text-right text-[11px] text-ink-dim">
                        {formatRelative(message.created_at)}
                      </p>
                    </div>
                  ) : message.role === "assistant" ? (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      profileLabel={profileName(
                        parseChatMeta(message.meta)?.profile_id ??
                          detail.chat.profile_id,
                      )}
                    />
                  ) : (
                    <p
                      key={message.id}
                      className="text-center text-[11px] text-ink-dim"
                    >
                      {message.content}
                    </p>
                  ),
                )}

                {stream.state.streaming && (
                  <div className="max-w-[85%]">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-dim">
                      <span className="font-medium text-ink-muted">
                        {profileName(detail.chat.profile_id)}
                      </span>
                      <span>·</span>
                      <span>working</span>
                    </div>
                    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
                      {stream.state.text ? (
                        <MessageContent content={stream.state.text} />
                      ) : (
                        <p className="flex items-center gap-2 text-sm text-ink-muted">
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden
                          />
                          Waiting for {vendorLabel(detail.chat.vendor)}…
                        </p>
                      )}
                      <ToolChips tools={stream.state.tools} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-line p-3">
              <div className="mx-auto w-full max-w-3xl rounded-lg border border-line bg-panel focus-within:border-line-strong">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={2}
                  placeholder={`Ask ${vendorLabel(detail.chat.vendor)} to inspect, explain, or change the project…`}
                  className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:outline-none"
                  aria-label="Message"
                />
                <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
                  <p className="px-1 text-[11px] text-ink-dim">
                    Enter to send · Shift+Enter for a new line ·{" "}
                    {permissionModeLabel(vendor, detail.chat.permission_mode)}
                  </p>
                  <div className="flex items-center gap-1">
                    {stream.state.streaming && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!stream.state.turnId}
                        onClick={() => void stream.stop()}
                      >
                        <Square className="h-3 w-3" aria-hidden />
                        Stop
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={
                        stream.state.streaming || composer.trim().length === 0
                      }
                      onClick={() => void handleSend()}
                    >
                      <Send className="h-3 w-3" aria-hidden />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <NewChatDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profiles={profiles}
        projects={projects}
        capabilities={capabilities}
        onCreated={handleCreated}
        onNavigate={onNavigate}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.title ?? "chat"}?`}
        description="The transcript is removed permanently. Switch events and session records stay in Activity."
        confirmLabel="Delete chat"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />

      {detail && (
        <SwitchAccountDialog
          open={switchOpen}
          onOpenChange={setSwitchOpen}
          chat={detail.chat}
          profiles={profiles}
          onSwitched={applyChat}
          onRequestClientConfirm={setPendingClientProfile}
          onNavigate={onNavigate}
        />
      )}

      {pendingClientProfile && detail && (
        <ClientBoundaryModal
          open
          targetProfile={pendingClientProfile}
          fromProfile={
            profiles.find((profile) => profile.id === detail.chat.profile_id) ??
            null
          }
          projectName={
            projects.find((project) => project.id === detail.chat.project_id)
              ?.name ?? null
          }
          loading={switchingClient}
          onConfirm={() => void handleClientSwitch(pendingClientProfile)}
          onCancel={() => setPendingClientProfile(null)}
        />
      )}
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split("```");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {parts.map((part, index) =>
        index % 2 === 0 ? (
          part.trim() ? (
            <p key={index} className="whitespace-pre-wrap break-words">
              {part.trim()}
            </p>
          ) : null
        ) : (
          <pre
            key={index}
            className="overflow-x-auto rounded border border-line bg-canvas p-3 font-mono text-[12px] leading-relaxed text-ink-muted"
          >
            {part.replace(/^[a-zA-Z0-9_+-]*\n/, "").replace(/\s+$/, "")}
          </pre>
        ),
      )}
    </div>
  );
}

function ToolChips({ tools }: { tools: ChatToolRecord[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tools.map((tool, index) => (
        <span
          key={`${tool.name}-${index}`}
          className="inline-flex items-center gap-1 rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
        >
          <Wrench className="h-3 w-3" aria-hidden />
          {tool.summary}
        </span>
      ))}
    </div>
  );
}

function AssistantMessage({
  message,
  profileLabel,
}: {
  message: ChatMessage;
  profileLabel: string;
}) {
  const meta = parseChatMeta(message.meta);
  const usage = meta?.usage ? formatTokens(meta.usage) : null;

  return (
    <div className="max-w-[85%]">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-dim">
        <span className="font-medium text-ink-muted">{profileLabel}</span>
        <span>·</span>
        <span>{formatRelative(message.created_at)}</span>
      </div>
      <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
        <MessageContent content={message.content} />
        {meta && <ToolChips tools={meta.tools} />}
      </div>
      {usage && (
        <p className="mt-1 text-right text-[11px] text-ink-dim">{usage}</p>
      )}
    </div>
  );
}
