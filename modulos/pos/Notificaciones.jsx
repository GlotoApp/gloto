import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  CreditCard,
  Package,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../src/lib/supabaseClient";

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "No leídas" },
];
const PAGE_SIZE = 10;
const LEGACY_STOCK_NOTIFICATION_TYPES =
  '("stock_low","product_stock_low","product_out_of_stock")';

const isOlderNotification = (notification, cursor) =>
  notification.created_at < cursor.created_at ||
  (notification.created_at === cursor.created_at &&
    notification.id < cursor.id);

const getNotificationIcon = (type) => {
  if (type.startsWith("plan_")) return CreditCard;
  if (
    type === "stock_low" ||
    type.startsWith("product_") ||
    type.startsWith("products_") ||
    type.startsWith("inventory_")
  ) {
    return Package;
  }
  return CircleAlert;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function Notificaciones() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const notificationsRef = useRef([]);
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(false);

  const loadNotifications = useCallback(
    async ({
      refresh = true,
      sync = true,
      silent = false,
      append = false,
      excludeNotificationId = null,
    } = {}) => {
      if (append) setLoadingMore(true);
      else if (refresh) setRefreshing(true);
      else if (!silent) setLoading(true);
      setError("");

      if (sync) {
        const { error: refreshError } = await supabase.rpc(
          "refresh_business_notifications",
        );
        if (refreshError) {
          console.error(
            "No se pudieron actualizar las notificaciones:",
            refreshError,
          );
          setError("No se pudieron actualizar los avisos.");
        }
      }

      const cursor = append ? cursorRef.current : null;
      let query = supabase
        .from("business_notifications")
        .select(
          "id,notification_type,title,message,severity,entity_type,entity_id,action_path,created_at,read_at,resolved_at",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1)
        .not("notification_type", "in", LEGACY_STOCK_NOTIFICATION_TYPES);

      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        );
      }
      if (filter === "unread") query = query.is("read_at", null);

      const [
        { data, error: queryError },
        { count: unreadTotal, error: unreadError },
      ] = await Promise.all([
        query,
        supabase
          .from("business_notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null)
          .not("notification_type", "in", LEGACY_STOCK_NOTIFICATION_TYPES),
      ]);

      if (queryError || unreadError) {
        console.error(
          "No se pudo cargar el historial:",
          queryError || unreadError,
        );
        setError("No se pudo cargar el historial de notificaciones.");
      } else {
        const pageItems = (data || []).slice(0, PAGE_SIZE);
        const moreAvailable = (data || []).length > PAGE_SIZE;

        if (append) {
          const current = notificationsRef.current;
          const currentIds = new Set(current.map((item) => item.id));
          const combined = [
            ...current,
            ...pageItems.filter((item) => !currentIds.has(item.id)),
          ];
          notificationsRef.current = combined;
          setNotifications(combined);
          cursorRef.current = pageItems.at(-1) || cursor;
          hasMoreRef.current = moreAvailable;
          setHasMore(moreAvailable);
        } else if (silent) {
          const boundary = pageItems.at(-1);
          const olderItems = boundary
            ? notificationsRef.current.filter(
                (item) =>
                  item.id !== excludeNotificationId &&
                  isOlderNotification(item, boundary),
              )
            : [];
          const combined = [...pageItems, ...olderItems];
          notificationsRef.current = combined;
          setNotifications(combined);
          cursorRef.current = combined.at(-1) || null;
          const canLoadMore =
            moreAvailable || (olderItems.length > 0 && hasMoreRef.current);
          hasMoreRef.current = canLoadMore;
          setHasMore(canLoadMore);
        } else {
          notificationsRef.current = pageItems;
          setNotifications(pageItems);
          cursorRef.current = pageItems.at(-1) || null;
          hasMoreRef.current = moreAvailable;
          setHasMore(moreAvailable);
        }
        setUnreadCount(unreadTotal || 0);
      }
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    },
    [filter],
  );

  useEffect(() => {
    loadNotifications({ refresh: false });
  }, [loadNotifications]);

  useEffect(() => {
    let cancelled = false;
    let channel;
    let refreshTimeout;

    const subscribeToBusinessNotifications = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id || cancelled) return;

      channel = supabase
        .channel(`business-notifications-${profile.business_id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "business_notifications",
            filter: `business_id=eq.${profile.business_id}`,
          },
          (payload) => {
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
              loadNotifications({
                refresh: false,
                sync: false,
                silent: true,
                excludeNotificationId:
                  filter === "unread" &&
                  payload.eventType === "UPDATE" &&
                  payload.new?.read_at
                    ? payload.new.id
                    : null,
              });
            }, 150);
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Realtime de notificaciones no disponible:", status);
          }
        });
    };

    subscribeToBusinessNotifications();

    return () => {
      cancelled = true;
      if (refreshTimeout) clearTimeout(refreshTimeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [filter, loadNotifications]);

  const markAsRead = async (notification) => {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("business_notifications")
      .update({ read_at: readAt })
      .eq("id", notification.id);

    if (updateError) {
      console.error("No se pudo marcar el aviso como leído:", updateError);
      setError("No se pudo actualizar el aviso.");
      return;
    }

    const updatedNotifications =
      filter === "unread"
        ? notificationsRef.current.filter((item) => item.id !== notification.id)
        : notificationsRef.current.map((item) =>
            item.id === notification.id ? { ...item, read_at: readAt } : item,
          );
    notificationsRef.current = updatedNotifications;
    setNotifications(updatedNotifications);
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;

    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("business_notifications")
      .update({ read_at: readAt })
      .is("read_at", null)
      .not("notification_type", "in", LEGACY_STOCK_NOTIFICATION_TYPES);

    if (updateError) {
      console.error("No se pudieron marcar los avisos:", updateError);
      setError("No se pudieron marcar todas como leídas.");
      return;
    }

    const updatedNotifications =
      filter === "unread"
        ? []
        : notificationsRef.current.map((notification) =>
            notification.read_at
              ? notification
              : { ...notification, read_at: readAt },
          );
    notificationsRef.current = updatedNotifications;
    setNotifications(updatedNotifications);
    setUnreadCount(0);
    if (filter === "unread") {
      cursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
    }
  };

  const openNotification = async (notification) => {
    await markAsRead(notification);
    if (notification.action_path) navigate(notification.action_path);
  };

  const visibleNotifications = notifications;

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
              <Bell size={23} className="text-violet-300" /> Notificaciones
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs font-black text-rose-300">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0 || loading}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              <CheckCheck size={15} /> Marcar todo leído
            </button>
            <button
              type="button"
              onClick={() => loadNotifications()}
              disabled={refreshing || loading}
              aria-label="Actualizar notificaciones"
              className="rounded-lg border border-white/10 p-2 text-neutral-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
        </header>

        <div className="flex gap-2 border-b border-white/10">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (filter === item.id) return;
                notificationsRef.current = [];
                cursorRef.current = null;
                hasMoreRef.current = false;
                setNotifications([]);
                setHasMore(false);
                setFilter(item.id);
              }}
              className={`border-b-2 px-3 py-2 text-xs font-bold transition ${filter === item.id ? "border-violet-400 text-white" : "border-transparent text-neutral-500 hover:text-neutral-200"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            Cargando notificaciones...
          </p>
        ) : visibleNotifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
            <Bell className="mx-auto mb-3 text-neutral-600" size={25} />
            <p className="text-sm font-bold text-neutral-300">
              {filter === "unread"
                ? "No tienes avisos sin leer."
                : "Todavía no hay notificaciones."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {visibleNotifications.map((notification) => {
              const Icon = getNotificationIcon(notification.notification_type);
              const isUnread = !notification.read_at;
              const isResolved = Boolean(notification.resolved_at);
              return (
                <article
                  key={notification.id}
                  className={`flex flex-wrap items-start gap-3 py-4 ${isUnread ? "" : "opacity-70"}`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${notification.severity === "critical" ? "bg-rose-500/10 text-rose-300" : notification.severity === "warning" ? "bg-amber-500/10 text-amber-300" : "bg-violet-500/10 text-violet-300"}`}
                  >
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-white">
                        {notification.title}
                      </h2>
                      {isUnread && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-violet-400"
                          aria-label="No leída"
                        />
                      )}
                      {isResolved && (
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase text-neutral-400">
                          Resuelta
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-[10px] text-neutral-600">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notification)}
                        aria-label="Marcar como leída"
                        title="Marcar como leída"
                        className="rounded-lg p-2 text-neutral-500 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    {notification.action_path && (
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/[0.06]"
                      >
                        Ver
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && hasMore && (
          <footer className="flex justify-center border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() =>
                loadNotifications({
                  refresh: false,
                  sync: false,
                  append: true,
                })
              }
              disabled={loadingMore}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              {loadingMore ? "Cargando..." : "Ver más notificaciones"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
