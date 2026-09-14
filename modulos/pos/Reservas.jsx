import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  Phone,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatLongDate = (date) =>
  date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const formatMonth = (date) =>
  date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

const formatTime12Hour = (value) => {
  if (!value) return "Sin hora";
  const [hours, minutes] = String(value).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const getCalendarDays = (monthDate) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

const createOrderNumber = () =>
  `${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;

const createTrackingToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeWhatsappNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("57") ? digits : `57${digits.replace(/^0+/, "")}`;
};

const reservationReminderText = (reservation) =>
  `Hola ${reservation.customer_name || ""}, te recordamos tu reserva para el ${reservation.fecha_reserva || "día acordado"} a las ${formatTime12Hour(reservation.hora_reserva)}. Mesa ${reservation.mesa || ""}. Te esperamos.`;

const Reservas = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const today = formatDateKey(new Date());
  const [businessId, setBusinessId] = useState(null);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({
    mesa: "",
    nombre: "",
    telefono: "",
    fecha: today,
    hora: "",
    personas: "1",
    notas: "",
  });

  const loadReservations = useCallback(async (businessIdParam) => {
    if (!businessIdParam) return;
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,order_number,customer_name,customer_phone,mesa,personas,fecha_reserva,hora_reserva,notes,status,table_status",
      )
      .eq("business_id", businessIdParam)
      .eq("is_reservation", true)
      .order("fecha_reserva", { ascending: true })
      .order("hora_reserva", { ascending: true });

    if (error) {
      console.error("Error cargando reservas:", error);
      setErrorMessage("No se pudieron cargar las reservas.");
      setReservations([]);
    } else {
      setReservations(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const loadBusiness = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !data?.business_id) {
        setErrorMessage("No se encontró el negocio del usuario.");
        setLoading(false);
        return;
      }

      setBusinessId(data.business_id);
      await loadReservations(data.business_id);
    };

    loadBusiness();
  }, [loadReservations, user?.id]);

  useEffect(() => {
    const nuevaReserva = location.state?.nuevaReserva;
    if (!nuevaReserva) return;
    setForm((current) => ({
      ...current,
      mesa: nuevaReserva.mesa || current.mesa,
      nombre: nuevaReserva.nombre || current.nombre,
      telefono: nuevaReserva.telefono || current.telefono,
      personas: nuevaReserva.personas || current.personas,
    }));
    setShowForm(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`reservas-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => loadReservations(businessId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, loadReservations]);

  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const reservationCountByDate = useMemo(
    () =>
      reservations.reduce((result, reservation) => {
        const date = reservation.fecha_reserva;
        if (date) result[date] = (result[date] || 0) + 1;
        return result;
      }, {}),
    [reservations],
  );
  const selectedReservations = reservations.filter(
    (reservation) => reservation.fecha_reserva === selectedDate,
  );
  const reservedDates = Object.keys(reservationCountByDate).length;

  const reservationDateConflict =
    Boolean(form.mesa && form.fecha) &&
    reservations.some(
      (reservation) =>
        reservation.fecha_reserva === form.fecha &&
        String(reservation.mesa) === String(form.mesa),
    );

  const updateForm = (field, value) => {
    setErrorMessage("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const createReservation = async (event) => {
    event.preventDefault();
    if (!businessId || saving) return;

    const requiredFields = [
      form.mesa,
      form.nombre,
      form.telefono,
      form.fecha,
      form.hora,
    ];
    if (requiredFields.some((value) => !String(value).trim())) {
      setErrorMessage("Completa mesa, cliente, teléfono, fecha y hora.");
      return;
    }

    if (reservationDateConflict) {
      setErrorMessage(
        "La mesa ya está reservada para esa fecha. Selecciona otra mesa o fecha.",
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");
    const orderPayload = {
      business_id: businessId,
      status: "pending",
      total: 0,
      order_number: createOrderNumber(),
      updated_at: new Date().toISOString(),
      scheduled_at: null,
      delivery_address: null,
      delivery_instructions: null,
      delivery_fee: 0,
      tax_amount: 0,
      discount_amount: 0,
      tip_amount: 0,
      payment_method: null,
      payment_status: "pending",
      order_type: "table",
      customer_name: form.nombre,
      customer_phone: form.telefono,
      currency: "COP",
      mesa: Number(form.mesa),
      table_status: "reserva",
      is_reservation: true,
      personas: Number(form.personas) || 1,
      fecha_reserva: form.fecha,
      hora_reserva: form.hora,
      punto: null,
      notes: form.notas.trim() || null,
      metadata: {
        canal: "pos",
        createdFrom: "reservas_app",
        metodoEntrega: "mesa",
        tracking_token: createTrackingToken(),
        payment_methods: [],
        cliente: { nombre: form.nombre, telefono: form.telefono },
        reserva_type: "desde_reservas",
      },
    };

    const { error } = await supabase.rpc("create_order", {
      p_order: orderPayload,
      p_items: [],
    });

    if (error) {
      console.error("Error creando reserva:", error);
      setErrorMessage("No se pudo crear la reserva.");
    } else {
      setShowForm(false);
      setSelectedDate(form.fecha);
      setMonthDate(parseDateKey(form.fecha));
      setForm({
        mesa: "",
        nombre: "",
        telefono: "",
        fecha: today,
        hora: "",
        personas: "1",
        notas: "",
      });
      await loadReservations(businessId);
    }
    setSaving(false);
  };

  const deleteReservation = async (reservation) => {
    const customerName = reservation.customer_name || "este cliente";
    const reservationDetails = [
      reservation.mesa ? `mesa ${reservation.mesa}` : "sin mesa",
      reservation.fecha_reserva || "sin fecha",
      formatTime12Hour(reservation.hora_reserva),
    ].join(" · ");
    const confirmed = window.confirm(
      `¿Está seguro de eliminar esta reserva?\n\nCliente: ${customerName}\n${reservationDetails}`,
    );
    if (!confirmed || !businessId || deletingId) return;

    setDeletingId(reservation.id);
    setErrorMessage("");
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", reservation.id)
      .eq("business_id", businessId)
      .eq("is_reservation", true);

    if (error) {
      console.error("Error eliminando reserva:", error);
      setErrorMessage("No se pudo eliminar la reserva.");
    } else {
      await loadReservations(businessId);
    }
    setDeletingId(null);
  };

  const moveMonth = (amount) => {
    setMonthDate(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-white">
      <div className="mx-auto max-w-7xl pb-20">
        <header className="mb-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tighter">Reservas</h1>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                Disponibilidad y agenda de mesas
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setForm((current) => ({ ...current, fecha: selectedDate }));
                setShowForm(true);
              }}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-violet-900/20 transition-colors hover:bg-violet-500"
            >
              + Nueva Reserva
            </button>
          </div>
        </header>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Reservas totales", reservations.length, "event_note"],
            ["Fechas ocupadas", reservedDates, "calendar_month"],
            ["Seleccionadas hoy", selectedReservations.length, "today"],
          ].map(([label, value, icon]) => (
            <div
              key={label}
              className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/5 bg-neutral-900/40 px-4 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <span className="material-symbols-outlined">{icon}</span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-[8px] font-black uppercase tracking-widest text-neutral-500">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-black leading-none text-white">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <main className="space-y-5">
          {showForm && (
            <form
              onSubmit={createReservation}
              className="mb-5 rounded-2xl border border-violet-500/20 bg-neutral-900/40 p-4 shadow-xl md:p-6"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Nueva Reserva</h2>
                  <p className="text-xs text-neutral-500">
                    La disponibilidad se valida antes de guardar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs font-bold text-neutral-500 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["nombre", "Cliente", "text"],
                  ["telefono", "Teléfono", "tel"],
                  ["mesa", "Mesa", "number"],
                  ["fecha", "Fecha", "date"],
                  ["hora", "Hora", "time"],
                  ["personas", "Personas", "number"],
                ].map(([field, label, type]) => (
                  <label
                    key={field}
                    className="text-xs font-bold text-on-surface-variant"
                  >
                    {label}
                    <input
                      type={type}
                      min={field === "personas" ? 1 : undefined}
                      value={form[field]}
                      onChange={(event) =>
                        updateForm(field, event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-white/5 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                    />
                  </label>
                ))}
                <label className="text-xs font-bold text-on-surface-variant sm:col-span-2 lg:col-span-2">
                  Notas
                  <input
                    type="text"
                    value={form.notas}
                    onChange={(event) =>
                      updateForm("notas", event.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-white/5 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                  />
                </label>
              </div>
              {reservationDateConflict && (
                <div className="mt-4 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm font-bold text-error">
                  Esta mesa ya está ocupada por una reserva en la fecha
                  seleccionada. La hora no cambia la disponibilidad de la mesa.
                </div>
              )}
              <button
                type="submit"
                disabled={saving || reservationDateConflict}
                className="mt-4 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Crear reserva"}
              </button>
            </form>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {errorMessage}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)]">
            <section className="rounded-2xl border border-white/5 bg-neutral-900/40 p-4 shadow-2xl md:p-6">
              <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-400">
                    Disponibilidad
                  </p>
                  <h2 className="mt-1 text-lg font-black">Calendario</h2>
                </div>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-white/10 hover:text-white"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="rounded-lg bg-neutral-950 px-3 py-2 text-sm font-black capitalize">
                  {formatMonth(monthDate)}
                </h2>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-white/10 hover:text-white"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                  (day) => (
                    <span key={day} className="py-2">
                      {day}
                    </span>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const dateKey = formatDateKey(day);
                  const isCurrentMonth =
                    day.getMonth() === monthDate.getMonth();
                  const isSelected = dateKey === selectedDate;
                  const isToday = dateKey === today;
                  const count = reservationCountByDate[dateKey] || 0;
                  return (
                    <button
                      type="button"
                      key={dateKey}
                      onClick={() => setSelectedDate(dateKey)}
                      className={`relative min-h-20 rounded-2xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-violet-500/50 bg-violet-500/15 text-white shadow-lg shadow-violet-900/10"
                          : "border-white/6 bg-neutral-950 hover:border-violet-500/40 hover:bg-white/5"
                      } ${!isCurrentMonth ? "opacity-35" : ""}`}
                    >
                      <span
                        className={`text-sm font-bold ${isToday ? "text-violet-400" : ""}`}
                      >
                        {day.getDate()}
                      </span>
                      {count > 0 && (
                        <span className="absolute bottom-2 left-2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black text-white">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/5 bg-neutral-900/40 p-4 shadow-2xl md:p-6">
              <div className="mb-4 flex items-start gap-3 border-b border-white/5 pb-4">
                <div className="rounded-xl bg-violet-500/15 p-2 text-violet-400">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-400">
                    Agenda del día
                  </p>
                  <h2 className="mt-1 text-lg font-black capitalize">
                    {formatLongDate(parseDateKey(selectedDate))}
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    {selectedReservations.length} reserva
                    {selectedReservations.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                      style={{ animationDelay: `${dot * 150}ms` }}
                    />
                  ))}
                </div>
              ) : selectedReservations.length === 0 ? (
                <div className="py-12 text-center text-sm text-on-surface-variant">
                  No hay reservas para este día.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedReservations.map((reservation) => (
                    <article
                      key={reservation.id}
                      className="rounded-2xl border border-white/5 bg-neutral-950/60 p-4 transition-colors hover:border-violet-500/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-on-surface">
                            {reservation.customer_name || "Cliente sin nombre"}
                          </h3>
                          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-violet-400">
                            <Clock3 size={13} />
                            {formatTime12Hour(reservation.hora_reserva)}
                          </p>
                        </div>
                        <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-black uppercase text-violet-400">
                          Mesa {reservation.mesa || "-"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <Users size={13} /> {reservation.personas || 1}{" "}
                          personas
                        </span>
                        {reservation.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={13} /> {reservation.customer_phone}
                          </span>
                        )}
                      </div>
                      {reservation.customer_phone && (
                        <div className="mt-4 flex gap-2 border-t border-white/8 pt-3">
                          <a
                            href={`tel:${reservation.customer_phone}`}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-300 transition-colors hover:bg-blue-500/20"
                            aria-label={`Llamar a ${reservation.customer_name || "cliente"}`}
                          >
                            <Phone size={14} />
                            Llamar
                          </a>
                          <a
                            href={`https://wa.me/${normalizeWhatsappNumber(reservation.customer_phone)}?text=${encodeURIComponent(reservationReminderText(reservation))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300 transition-colors hover:bg-emerald-500/20"
                            aria-label={`Enviar WhatsApp a ${reservation.customer_name || "cliente"}`}
                          >
                            <MessageCircle size={14} />
                            WhatsApp
                          </a>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteReservation(reservation)}
                        disabled={deletingId === reservation.id}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {deletingId === reservation.id
                          ? "Eliminando..."
                          : "Eliminar reserva"}
                      </button>
                      {reservation.notes && (
                        <p className="mt-3 border-t border-outline pt-3 text-xs text-on-surface-variant">
                          {reservation.notes}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Reservas;
