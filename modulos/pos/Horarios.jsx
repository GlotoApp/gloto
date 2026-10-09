import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";
import { SubLoading } from "./Loading";
import { Plus, Trash2, Moon, Sun, CalendarClock } from "lucide-react";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const DAY_TO_NUMBER = DAYS.reduce((map, day, index) => {
  map[day] = index + 1;
  return map;
}, {});

const NUMBER_TO_DAY = Object.fromEntries(
  Object.entries(DAY_TO_NUMBER).map(([day, number]) => [number, day]),
);

const createDefaultSchedule = () =>
  DAYS.reduce(
    (acc, day) => ({
      ...acc,
      [day]: {
        isOpen: false,
        turnos: [],
      },
    }),
    {},
  );

const parseTimeInput = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  if (minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "AM" && hours === 12) hours = 0;
    if (meridiem === "PM" && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const TurnoRow = ({ turno, index, day, onUpdate, onRemove }) => {
  return (
    <div className="rounded-xl bg-neutral-950/40 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        {/* 1. INPUT: HORA APERTURA */}
        <div className="flex flex-col gap-2 flex-1">
          <label className="ml-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Apertura
          </label>
          <div className="relative flex items-center">
            <Sun
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500/70 z-10 pointer-events-none"
            />
            {/* Clases Webkit añadidas para anular desajustes nativos de iPhone/Android */}
            <input
              type="time"
              value={turno.open || ""}
              onChange={(e) => onUpdate(day, index, "open", e.target.value)}
              className="h-12 w-full rounded-xl bg-neutral-900 pl-10 pr-3 text-base font-semibold text-white outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-violet-500/60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
        </div>

        <div className="hidden pb-2 text-lg font-medium text-neutral-500 lg:flex">
          →
        </div>

        {/* 2. INPUT: HORA CIERRE */}
        <div className="flex flex-col gap-2 flex-1">
          <label className="ml-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Cierre
          </label>
          <div className="relative flex items-center">
            <Moon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500/70 z-10 pointer-events-none"
            />
            {/* Clases Webkit añadidas para anular desajustes nativos de iPhone/Android */}
            <input
              type="time"
              value={turno.close || ""}
              onChange={(e) => onUpdate(day, index, "close", e.target.value)}
              className="h-12 w-full rounded-xl bg-neutral-900 pl-10 pr-3 text-base font-semibold text-white outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-violet-500/60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
        </div>

        {/* 3. SELECTOR DE CICLO OPERATIVO */}
        <div className="flex w-full flex-col gap-2 lg:w-auto">
          <label className="ml-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Dia cierre
          </label>

          <div className="relative flex h-12 items-center overflow-hidden rounded-xl bg-black/50 p-1">
            <button
              onClick={() => onUpdate(day, index, "closeDay", "same")}
              className={`relative z-10 h-full flex-1 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/70 ${
                turno.closeDay === "same"
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
              }`}
            >
              Mismo
            </button>

            <button
              onClick={() => onUpdate(day, index, "closeDay", "next")}
              className={`relative z-10 flex h-full flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/70 ${
                turno.closeDay === "next"
                  ? "bg-violet-600 text-white"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
              }`}
            >
              Siguiente
            </button>
          </div>
        </div>

        <button
          onClick={() => onRemove(day, index)}
          className="flex min-h-11 w-full items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 lg:h-12 lg:w-12"
        >
          <Trash2 size={16} />
          <span className="ml-2 text-xs font-semibold lg:hidden">
            Eliminar Turno
          </span>
        </button>
      </div>
    </div>
  );
};

export default function Horarios() {
  const { user } = useAuth();
  const initialSchedule = useMemo(() => createDefaultSchedule(), []);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [savedSchedule, setSavedSchedule] = useState(initialSchedule);
  const [businessId, setBusinessId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [notificationModal, setNotificationModal] = useState(null);

  const openNotification = (type, title, message) => {
    setNotificationModal({ type, title, message });
  };

  const hasChanges = JSON.stringify(schedule) !== JSON.stringify(savedSchedule);
  const hasConfiguredSchedule = DAYS.some(
    (day) => schedule[day].turnos.length > 0,
  );

  useEffect(() => {
    let isMounted = true;

    const loadSchedule = async () => {
      setIsLoading(true);
      setErrorMessage("");

      if (!user?.id) {
        if (isMounted) {
          setBusinessId(null);
          setIsLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        if (isMounted) {
          setBusinessId(null);
          setIsLoading(false);
          setErrorMessage("No se encontró el negocio del usuario.");
        }
        return;
      }

      const { data: rows, error: scheduleError } = await supabase
        .from("business_hours")
        .select(
          "day_of_week, shift_index, is_open, open_time, close_time, close_day",
        )
        .eq("business_id", profile.business_id)
        .order("day_of_week")
        .order("shift_index");

      if (scheduleError) {
        if (isMounted) {
          setBusinessId(profile.business_id);
          setIsLoading(false);
          setErrorMessage("No se pudieron cargar los horarios.");
        }
        return;
      }

      const loadedSchedule = createDefaultSchedule();
      const rowsByDay = {};

      (rows || []).forEach((row) => {
        const day = NUMBER_TO_DAY[row.day_of_week];
        if (!day || row.shift_index > 1) return;

        if (!row.is_open) return;

        loadedSchedule[day].isOpen = true;

        if (!rowsByDay[day]) rowsByDay[day] = {};
        rowsByDay[day][row.shift_index] = {
          open: String(row.open_time).slice(0, 5),
          close: String(row.close_time).slice(0, 5),
          closeDay: row.close_day,
        };
      });

      Object.entries(rowsByDay).forEach(([day, turnosByIndex]) => {
        loadedSchedule[day].turnos = [0, 1]
          .map((shiftIndex) => turnosByIndex[shiftIndex])
          .filter(Boolean);
      });

      if (isMounted) {
        setBusinessId(profile.business_id);
        setSchedule(loadedSchedule);
        setSavedSchedule(loadedSchedule);
        setIsLoading(false);
      }
    };

    loadSchedule();
    return () => {
      isMounted = false;
    };
  }, [user, initialSchedule]);

  const updateTurno = (day, index, field, value) => {
    setSchedule((prev) => {
      const newTurnos = prev[day].turnos.map((turno, turnoIndex) =>
        turnoIndex === index ? { ...turno, [field]: value } : turno,
      );

      return {
        ...prev,
        [day]: { ...prev[day], turnos: newTurnos },
      };
    });
  };

  const addTurno = (day) => {
    if (schedule[day].turnos.length >= 2) return;
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        isOpen: true,
        turnos: [
          ...prev[day].turnos,
          { open: "", close: "", closeDay: "same" },
        ],
      },
    }));
  };

  const removeTurno = (day, index) => {
    if (schedule[day].turnos.length <= 1) return;
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        turnos: prev[day].turnos.filter((_, i) => i !== index),
      },
    }));
  };

  const saveSchedule = async () => {
    if (!businessId || isSaving || !hasChanges) return;

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const rows = DAYS.flatMap((day) => {
      const daySchedule = schedule[day];

      if (!daySchedule.isOpen) {
        return [
          {
            business_id: businessId,
            day_of_week: DAY_TO_NUMBER[day],
            shift_index: 0,
            is_open: false,
            open_time: "00:00",
            close_time: "00:00",
            close_day: "next",
          },
        ];
      }

      return daySchedule.turnos.slice(0, 2).map((turno, shiftIndex) => {
        const openTime = parseTimeInput(turno.open);
        const closeTime = parseTimeInput(turno.close);

        return {
          business_id: businessId,
          day_of_week: DAY_TO_NUMBER[day],
          shift_index: shiftIndex,
          is_open: daySchedule.isOpen,
          open_time: openTime,
          close_time: closeTime,
          close_day: turno.closeDay,
        };
      });
    });

    const invalidOpenDay = DAYS.find(
      (day) => schedule[day].isOpen && schedule[day].turnos.length === 0,
    );
    const invalidRow = rows.find((row) => {
      if (!row.is_open) return false;

      return (
        !row.open_time ||
        !row.close_time ||
        !["same", "next"].includes(row.close_day) ||
        (row.open_time === row.close_time && row.close_day !== "next") ||
        (row.close_day === "same" && row.close_time <= row.open_time)
      );
    });

    if (invalidOpenDay || invalidRow) {
      setIsSaving(false);
      setErrorMessage("Revisa las horas y el día de cierre de cada turno.");
      openNotification(
        "error",
        "Horario incompleto",
        "Revisa las horas y el día de cierre de cada turno antes de guardar.",
      );
      return;
    }

    const { error: deleteError } = await supabase
      .from("business_hours")
      .delete()
      .eq("business_id", businessId);

    if (deleteError) {
      setIsSaving(false);
      setErrorMessage("No se pudieron actualizar los horarios.");
      openNotification(
        "error",
        "No se pudo actualizar",
        "No se pudieron actualizar los horarios. Intenta de nuevo.",
      );
      return;
    }

    const { error: insertError } = await supabase
      .from("business_hours")
      .insert(rows);

    if (insertError) {
      setIsSaving(false);
      setErrorMessage("No se pudieron guardar los horarios.");
      openNotification(
        "error",
        "No se pudo guardar",
        "No se pudieron guardar los horarios. Intenta de nuevo.",
      );
      return;
    }

    setSavedSchedule(schedule);
    setIsSaving(false);
    setSuccessMessage("Horarios guardados correctamente.");
    openNotification(
      "success",
      "Horarios guardados",
      "Los cambios se han guardado correctamente.",
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-neutral-200 md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-row items-center justify-between gap-4 md:mb-8">
          {/* BLOQUE DE TITULACIÓN */}
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter text-white">
              Horarios
            </h1>
          </div>

          {/* BOTÓN ALINEADO AL EXTREMO DERECHO */}
          <button
            type="button"
            onClick={saveSchedule}
            disabled={!hasChanges || isLoading || isSaving || !businessId}
            className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
              hasChanges && !isLoading && !isSaving && businessId
                ? "bg-violet-600 text-white hover:bg-violet-500"
                : "cursor-not-allowed bg-neutral-800 text-neutral-500 opacity-70"
            }`}
          >
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </header>

        {notificationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-violet-500/10">
              <div className="mb-4 flex items-center justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    notificationModal.type === "success"
                      ? "bg-green-500/10 text-green-300"
                      : "bg-red-500/10 text-red-300"
                  }`}
                >
                  {notificationModal.type === "success" ? "✓" : "!"}
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationModal(null)}
                  className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 transition hover:text-white"
                >
                  Cerrar
                </button>
              </div>

              <p className="text-lg font-black uppercase tracking-[0.12em] text-white">
                {notificationModal.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                {notificationModal.message}
              </p>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setNotificationModal(null)}
                  className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition ${
                    notificationModal.type === "success"
                      ? "bg-green-500 text-green-950 hover:bg-green-400"
                      : "bg-red-500 text-white hover:bg-red-400"
                  }`}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <SubLoading
            label="Cargando horario"
            className="py-20"
            dotClassName="bg-violet-400"
          />
        ) : !hasConfiguredSchedule ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.08] via-neutral-900/40 to-neutral-950 px-6 py-16 text-center md:py-20">
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300 shadow-[0_0_35px_rgba(139,92,246,0.12)]">
              <CalendarClock size={30} strokeWidth={1.6} />
            </div>
            <p className="relative text-base font-black uppercase tracking-[0.18em] text-white">
              Tu horario está vacío
            </p>
            <p className="relative mt-2 max-w-md text-xs leading-5 text-neutral-400">
              Configura los días y turnos en los que tu negocio recibe pedidos.
            </p>
            <button
              type="button"
              onClick={() => addTurno("Lunes")}
              className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-400 active:scale-95"
            >
              <Plus size={14} />
              Configurar horario
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {DAYS.map((day) => (
              <div
                key={day}
                className="rounded-2xl bg-neutral-900/40 p-4 md:p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                    {day}
                  </span>

                  {/* CONTENEDOR DEL SWITCH */}
                  <div className="flex select-none items-center gap-3 px-2">
                    {/* Label de Estado Técnico */}
                    <span
                      className={`text-xs font-semibold transition-colors ${
                        schedule[day].isOpen ? "text-emerald-300" : "text-neutral-400"
                      }`}
                    >
                      {schedule[day].isOpen ? "Abierto" : "Cerrado"}
                    </span>

                    {/* Botón Switch Deslizante */}
                    <button
                      type="button"
                      onClick={() =>
                        setSchedule((p) => ({
                          ...p,
                          [day]: { ...p[day], isOpen: !p[day].isOpen },
                        }))
                      }
                      className={`relative inline-flex h-7 w-12 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
                        schedule[day].isOpen ? "bg-emerald-600" : "bg-neutral-700"
                      }`}
                    >
                      {/* Esfera / Diodo deslizante interno */}
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ${
                          schedule[day].isOpen
                            ? "translate-x-5"
                            : "translate-x-1 bg-neutral-400"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {schedule[day].isOpen && (
                  <div className="space-y-3">
                    {schedule[day].turnos.map((turno, idx) => (
                      <TurnoRow
                        key={idx}
                        index={idx}
                        day={day}
                        turno={turno}
                        onUpdate={updateTurno}
                        onRemove={removeTurno}
                      />
                    ))}
                    <button
                      onClick={() => addTurno(day)}
                      className="flex min-h-11 w-full items-center justify-center rounded-xl bg-white/[0.03] text-sm font-semibold text-neutral-400 transition-colors hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                    >
                      <Plus size={14} className="inline mr-1 md:mr-2" />
                      Añadir Turno
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
