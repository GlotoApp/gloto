import { useEffect, useRef } from "react";
import { supabase } from "../../src/lib/supabaseClient";

const FALLBACK_REFRESH_MS = 30_000;

export const useAdminRealtime = (
  tables,
  onUpdate,
  refreshOnMount = false,
) => {
  const onUpdateRef = useRef(onUpdate);
  const refreshInProgressRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const tableKey = [...new Set(tables)].sort().join(",");

  useEffect(() => {
    const watchedTables = tableKey ? tableKey.split(",") : [];
    if (watchedTables.length === 0) return undefined;
    const refresh = async () => {
      if (refreshInProgressRef.current) {
        refreshQueuedRef.current = true;
        return;
      }
      refreshInProgressRef.current = true;
      try {
        await onUpdateRef.current();
      } catch (error) {
        console.error("No se pudieron actualizar los datos de Admin:", error);
      } finally {
        refreshInProgressRef.current = false;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          queueMicrotask(refresh);
        }
      }
    };

    const channel = supabase.channel(
      `admin-live-${watchedTables.join("-")}`,
    );
    watchedTables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      );
    });

    if (refreshOnMount) void refresh();
    channel.subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(
          `No se pudo establecer Realtime para Admin (${watchedTables.join(", ")}):`,
          error || status,
        );
      }
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const intervalId = window.setInterval(
      refreshWhenVisible,
      FALLBACK_REFRESH_MS,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [refreshOnMount, tableKey]);
};
