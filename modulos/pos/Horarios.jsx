import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";
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
    <div className="bg-neutral-900/30 p-4 md:p-6 rounded-2xl border border-neutral-700/50 hover:border-violet-500/50 transition-all group">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        {/* 1. INPUT: HORA APERTURA */}
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-[7px] md:text-[8px] font-black uppercase text-neutral-500 ml-1 tracking-wider">
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
              className="w-full h-11 md:h-10 bg-neutral-900 border border-white/5 rounded-lg pl-10 pr-3 text-sm md:text-xs font-bold text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all appearance-none leading-none flex items-center [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
        </div>

        <div className="hidden lg:flex text-neutral-600 font-black text-lg pb-2">
          →
        </div>

        {/* 2. INPUT: HORA CIERRE */}
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-[7px] md:text-[8px] font-black uppercase text-neutral-500 ml-1 tracking-wider">
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
              className="w-full h-11 md:h-10 bg-neutral-900 border border-white/5 rounded-lg pl-10 pr-3 text-sm md:text-xs font-bold text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all appearance-none leading-none flex items-center [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
        </div>

        {/* 3. SELECTOR DE CICLO OPERATIVO */}
        <div className="flex flex-col gap-2 w-full lg:w-auto">
          <label className="text-[7px] md:text-[8px] font-black uppercase text-neutral-500 tracking-widest ml-1 flex items-center gap-2">
            <div className="w-1 h-1 bg-violet-500 rounded-full animate-pulse" />
            Dia cierre
          </label>

          <div className="relative flex bg-black border border-white/10 p-1 rounded-3xl overflow-hidden group/selector h-11 md:h-10 items-center">
            <button
              onClick={() => onUpdate(day, index, "closeDay", "same")}
              className={`relative z-10 flex-1 px-3 md:px-4 h-full rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-tighter transition-all duration-300 ${
                turno.closeDay === "same"
                  ? "bg-neutral-100 text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Mismo
            </button>

            <button
              onClick={() => onUpdate(day, index, "closeDay", "next")}
              className={`relative z-10 flex-1 px-3 md:px-4 h-full rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-tighter transition-all duration-300 flex items-center justify-center gap-1 md:gap-2 ${
                turno.closeDay === "next"
                  ? "bg-violet-600 text-white shadow-[0_0_25px_rgba(139,92,246,0.3)]"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Siguiente
            </button>
          </div>
        </div>

        <button
          onClick={() => onRemove(day, index)}
          className="relative flex items-center justify-center h-11 w-full lg:w-11 lg:h-11 text-neutral-600 hover:text-red-500  rounded-xl transition-all duration-300 group/delete shadow-inner"
        >
          <div className="absolute inset-0  opacity-0 group-hover/delete:opacity-100 rounded-xl transition-opacity" />
          <Trash2
            size={16}
            className="relative z-10 transition-transform group-active/delete:scale-90"
          />
          <span className="lg:hidden ml-2 text-[8px] font-black uppercase tracking-widest relative z-10">
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

        if (!rowsByDay[day]) rowsByDay[day] = {};
        rowsByDay[day][row.shift_index] = {
          open: String(row.open_time).slice(0, 5),
          close: String(row.close_time).slice(0, 5),
          closeDay: row.close_day,
        };
        loadedSchedule[day].isOpen = Boolean(row.is_open);
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

    const invalidRow = rows.find((row) => {
      if (!row.is_open) return false;

      return (
        !row.open_time ||
        !row.close_time ||
        !["same", "next"].includes(row.close_day) ||
        (row.open_time === row.close_time && row.close_day !== "next")
      );
    });

    if (invalidRow) {
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
    <div className="min-h-screen bg-background text-neutral-200 p-4 md:p-4 lg:p-4 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-row items-center justify-between mb-8 md:mb-12 gap-4">
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
            className={`px-5 md:px-8 py-2.5 md:py-3 rounded-xl font-black uppercase text-[9px] md:text-xs shadow-lg transition-all whitespace-nowrap ${
              hasChanges && !isLoading && !isSaving && businessId
                ? "bg-violet-500 hover:bg-violet-600 text-white shadow-violet-500/30 active:scale-95 cursor-pointer"
                : "bg-neutral-700 text-neutral-500 shadow-neutral-700/30 cursor-not-allowed opacity-50"
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
          <div className="flex items-center justify-center gap-2 py-20">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-2 w-2 animate-pulse rounded-full bg-violet-400"
                style={{ animationDelay: `${dot * 150}ms` }}
              />
            ))}
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-4 md:gap-6">
            {DAYS.map((day) => (
              <div
                key={day}
                className="p-4 md:p-6 lg:p-8 bg-neutral-900/40 border border-white/5 rounded-xl md:rounded-2xl"
              >
                <div className="flex items-center justify-between mb-4 md:mb-1 gap-3">
                  <span className="text-[8px] md:text-xs font-black uppercase tracking-widest text-fff  px-3 md:px-4 py-1.5 md:py-2 rounded-lg">
                    {day}
                  </span>

                  {/* CONTENEDOR DEL SWITCH */}
                  <div className="flex items-center gap-3  px-3 py-1.5  select-none">
                    {/* Label de Estado Técnico */}
                    <span
                      className={`text-[8px] md:text-[9px] font-black uppercase tracking-wider transition-colors duration-200 ${
                        schedule[day].isOpen ? "text-green-400" : "text-red-400"
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
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 cursor-pointer outline-none ${
                        schedule[day].isOpen ? "bg-green-500 " : "bg-red-800 "
                      }`}
                    >
                      {/* Esfera / Diodo deslizante interno */}
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                          schedule[day].isOpen
                            ? "translate-x-6"
                            : "translate-x-1 bg-neutral-400"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {schedule[day].isOpen && (
                  <div className="space-y-3 md:space-y-4">
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
                      className="w-full py-2.5 md:py-3 border-2 border-dashed border-white/5 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase text-neutral-500 hover:border-violet-500/50 hover:text-violet-400 hover:bg-violet-500/5 transition-all"
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
