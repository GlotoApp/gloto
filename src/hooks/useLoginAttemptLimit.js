import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gloto_login_attempt_limit_v1";
const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const fallbackState = { attempts: 0, lockedUntil: 0 };
let memoryState = fallbackState;

const readState = () => {
  let savedState = memoryState;

  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    savedState = storedValue ? JSON.parse(storedValue) : fallbackState;
  } catch (error) {
    console.error("No se pudo leer el límite local de intentos de acceso:", error);
  }

  const attempts = Number(savedState?.attempts);
  const lockedUntil = Number(savedState?.lockedUntil);
  const state = {
    attempts: Number.isInteger(attempts) ? attempts : 0,
    lockedUntil: Number.isFinite(lockedUntil) ? lockedUntil : 0,
  };

  if (state.lockedUntil && state.lockedUntil <= Date.now()) {
    writeState(fallbackState);
    return fallbackState;
  }

  memoryState = state;
  return state;
};

const writeState = (state) => {
  memoryState = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("No se pudo guardar el límite local de intentos de acceso:", error);
  }
};

export const getLoginLockMessage = (state) => {
  const remainingMinutes = Math.max(
    1,
    Math.ceil((state.lockedUntil - Date.now()) / 60000),
  );
  return `Límite alcanzado. Intenta de nuevo en ${remainingMinutes} min.`;
};

export const getLoginFailureMessage = (
  state,
  failureMessage = "Usuario o contraseña incorrectos",
) =>
  state.lockedUntil
    ? getLoginLockMessage(state)
    : `${failureMessage}. Intentos restantes: ${MAX_ATTEMPTS - state.attempts}.`;

export const useLoginAttemptLimit = () => {
  const [state, setState] = useState(readState);
  const isLocked = state.lockedUntil > Date.now();

  useEffect(() => {
    if (!state.lockedUntil) return undefined;

    const timer = window.setInterval(() => {
      setState(readState());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.lockedUntil]);

  const refreshState = useCallback(() => {
    const nextState = readState();
    setState(nextState);
    return nextState;
  }, []);

  const recordFailedAttempt = useCallback(() => {
    const currentState = readState();
    const attempts = currentState.attempts + 1;
    const nextState = {
      attempts,
      lockedUntil:
        attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : 0,
    };
    writeState(nextState);
    setState(nextState);
    return nextState;
  }, []);

  const resetAttempts = useCallback(() => {
    writeState(fallbackState);
    setState(fallbackState);
  }, []);

  return {
    isLocked,
    lockedUntil: state.lockedUntil,
    recordFailedAttempt,
    refreshState,
    resetAttempts,
  };
};
