"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CastHookState,
  type DriftFilter,
  addMessageListener,
  addSessionListener,
  endSession,
  generateCastToken,
  getApiBaseForCast,
  getCastState,
  getSession,
  isCastSdkAvailable,
  loadCastSdk,
  requestSession,
  sendMessage,
} from "@/lib/cast-api";

const INITIAL_STATE: CastHookState = {
  isAvailable: false,
  isConnected: false,
  isConnecting: false,
  receiverState: null,
  castToken: null,
  deviceName: null,
  error: null,
};

export function useChromecast() {
  const [state, setState] = useState<CastHookState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadCastSdk();
        if (cancelled) return;

        const castState = getCastState();
        const isAvailable = castState !== "NO_DEVICES_AVAILABLE";
        const isConnected = castState === "CONNECTED";

        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            isAvailable,
            isConnected,
            isConnecting: false,
            error: null,
          }));
        }
      } catch {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            isAvailable: false,
            error: "Cast SDK not available",
          }));
        }
      }
    }

    if (typeof window !== "undefined") {
      init();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubSession = addSessionListener((event) => {
      if (!mountedRef.current) return;

      const session = getSession();
      const isConnected = event.sessionState === "SESSION_STARTED" || event.sessionState === "SESSION_RESUMED";
      const deviceName = session?.getCastDevice()?.friendlyName ?? null;

      setState((prev) => ({
        ...prev,
        isConnected,
        isConnecting: false,
        deviceName,
        error: isConnected ? null : prev.error,
      }));

      if (isConnected && session) {
        const unsubMessage = addMessageListener((data) => {
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            receiverState: data,
          }));
        });
        return unsubMessage;
      } else {
        setState((prev) => ({
          ...prev,
          receiverState: null,
          castToken: null,
        }));
      }
    });

    return unsubSession;
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      await requestSession();
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isConnecting: true }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: err instanceof Error ? err.message : "Failed to connect",
        }));
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    endSession(true);
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      receiverState: null,
      castToken: null,
      deviceName: null,
    }));
  }, []);

  const startDrift = useCallback(async (treeId: string, filter: DriftFilter | null) => {
    try {
      const token = await generateCastToken(treeId);
      if (!mountedRef.current) return;

      setState((prev) => ({ ...prev, castToken: token }));

      const apiBase = getApiBaseForCast();

      sendMessage({
        type: "START_DRIFT",
        treeId,
        filter,
        castToken: token,
        apiBase,
      });
    } catch (err) {
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to start drift",
        }));
      }
    }
  }, []);

  const advance = useCallback(() => {
    sendMessage({ type: "ADVANCE" });
  }, []);

  const stepBack = useCallback(() => {
    sendMessage({ type: "STEP_BACK" });
  }, []);

  const play = useCallback(() => {
    sendMessage({ type: "PLAY" });
  }, []);

  const pause = useCallback(() => {
    sendMessage({ type: "PAUSE" });
  }, []);

  const jumpTo = useCallback((index: number) => {
    sendMessage({ type: "JUMP_TO", index });
  }, []);

  const togglePlayPause = useCallback(() => {
    if (state.receiverState?.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.receiverState?.isPlaying, pause, play]);

  const mute = useCallback((muted: boolean) => {
    sendMessage({ type: "MUTE", muted });
  }, []);

  const changeFilter = useCallback((filter: DriftFilter) => {
    sendMessage({ type: "CHANGE_FILTER", filter });
  }, []);

  const stopDrift = useCallback(() => {
    sendMessage({ type: "STOP_DRIFT" });
  }, []);

  return {
    state,
    connect,
    disconnect,
    startDrift,
    advance,
    stepBack,
    play,
    pause,
    togglePlayPause,
    jumpTo,
    mute,
    changeFilter,
    stopDrift,
    isCastAvailable: isCastSdkAvailable(),
  };
}