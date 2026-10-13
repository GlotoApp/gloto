import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const AdminLiveNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const channel = supabase
      .channel("superadmin-live-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "business_notifications",
        },
        ({ new: notification }) => {
          if (!notification?.id) return;
          setNotifications((current) => {
            if (current.some((item) => item.id === notification.id)) {
              return current;
            }
            return [notification, ...current].slice(0, 3);
          });
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "No se pudo conectar a las notificaciones en tiempo real de Admin:",
            error || status,
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (notifications.length === 0) return null;

  return (
    <aside
      aria-label="Notificaciones nuevas"
      className="fixed right-4 top-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {notifications.map((notification) => (
        <article
          key={notification.id}
          role="status"
          className="rounded-xl border border-red-400/30 bg-neutral-900/95 p-4 shadow-xl shadow-black/30 backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
              <Bell size={16} />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-red-200">
                Nueva notificación
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {notification.title || "Notificación del negocio"}
              </p>
              {notification.message && (
                <p className="mt-1 line-clamp-3 text-xs text-neutral-300">
                  {notification.message}
                </p>
              )}
              {notification.business_id && (
                <Link
                  to={`/gestion/tiendas/${notification.business_id}`}
                  className="mt-3 inline-flex text-xs font-bold text-violet-300 hover:text-violet-200"
                >
                  Ver negocio
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                setNotifications((current) =>
                  current.filter((item) => item.id !== notification.id),
                )
              }
              aria-label="Cerrar notificación"
              className="rounded-md p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        </article>
      ))}
    </aside>
  );
};

export default AdminLiveNotifications;
