import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, errorMessage, isTauriRuntime } from "./api";
import type {
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatLimitEvent,
  ChatSwitchEvent,
  ChatToolEvent,
  ChatToolRecord,
} from "./types";

export interface ChatStreamNotice {
  title: string;
  detail: string;
}

export interface ChatStreamState {
  streaming: boolean;
  turnId: string | null;
  text: string;
  tools: ChatToolRecord[];
  notice: ChatStreamNotice | null;
  error: string | null;
}

const initialState: ChatStreamState = {
  streaming: false,
  turnId: null,
  text: "",
  tools: [],
  notice: null,
  error: null,
};

interface UseChatStreamOptions {
  chatId: string | null;
  onFinished: () => void;
}

export function useChatStream({ chatId, onFinished }: UseChatStreamOptions) {
  const [state, setState] = useState<ChatStreamState>(initialState);
  const onFinishedRef = useRef(onFinished);
  const chatIdRef = useRef(chatId);
  onFinishedRef.current = onFinished;
  chatIdRef.current = chatId;

  useEffect(() => {
    setState(initialState);
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !isTauriRuntime()) return;

    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    function register<T extends { chat_id: string }>(
      name: string,
      handler: (payload: T) => void,
    ) {
      void listen<T>(name, (event) => {
        if (chatIdRef.current !== event.payload.chat_id) return;
        handler(event.payload);
      }).then((unlisten) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      });
    }

    register<ChatDeltaEvent>("chat:delta", (payload) => {
      setState((current) => ({
        ...current,
        streaming: true,
        text: current.text + payload.delta,
      }));
    });

    register<ChatToolEvent>("chat:tool", (payload) => {
      setState((current) => ({
        ...current,
        tools: [...current.tools, ...payload.tools],
      }));
    });

    register<ChatLimitEvent>("chat:limit", (payload) => {
      setState((current) => ({
        ...current,
        notice: { title: "Rate limit", detail: payload.detail },
      }));
    });

    register<ChatSwitchEvent>("chat:switch", (payload) => {
      // The turn restarts from scratch on the new account, so the abandoned
      // partial answer must not stay on screen.
      setState((current) => ({
        ...current,
        text: "",
        tools: [],
        notice: { title: "Account switched", detail: payload.detail },
      }));
      onFinishedRef.current();
    });

    register<ChatDoneEvent>("chat:done", () => {
      setState((current) => ({
        ...current,
        streaming: false,
        turnId: null,
        text: "",
        tools: [],
      }));
      onFinishedRef.current();
    });

    register<ChatErrorEvent>("chat:error", (payload) => {
      setState((current) => ({
        ...current,
        streaming: false,
        turnId: null,
        text: "",
        tools: [],
        error: payload.error,
      }));
      onFinishedRef.current();
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [chatId]);

  const send = useCallback(
    async (content: string): Promise<boolean> => {
      if (!chatId) return false;
      setState({ ...initialState, streaming: true });
      try {
        const turnId = await api.sendMessage({ chat_id: chatId, content });
        setState((current) =>
          current.streaming ? { ...current, turnId } : current,
        );
        return true;
      } catch (cause) {
        setState((current) => ({
          ...current,
          streaming: false,
          error: errorMessage(cause),
        }));
        return false;
      }
    },
    [chatId],
  );

  const stop = useCallback(async () => {
    if (!state.turnId) return;
    try {
      await api.cancelTurn(state.turnId);
    } catch (cause) {
      setState((current) => ({ ...current, error: errorMessage(cause) }));
    }
  }, [state.turnId]);

  const dismiss = useCallback(() => {
    setState((current) => ({ ...current, error: null, notice: null }));
  }, []);

  return { state, send, stop, dismiss };
}
