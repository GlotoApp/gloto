export const COLOR_MODE_STORAGE_KEY = "gloto-color-mode";

const normalizeColorMode = (mode) => (mode === "light" ? "light" : "dark");
const getStorageKey = (userId) =>
  userId ? `${COLOR_MODE_STORAGE_KEY}:${userId}` : COLOR_MODE_STORAGE_KEY;

export const getStoredColorMode = (userId) => {
  try {
    return normalizeColorMode(localStorage.getItem(getStorageKey(userId)));
  } catch (error) {
    console.error("No se pudo leer la preferencia de apariencia:", error);
    return "dark";
  }
};

export const cacheColorMode = (mode, userId) => {
  const nextMode = normalizeColorMode(mode);
  try {
    localStorage.setItem(getStorageKey(userId), nextMode);
  } catch (error) {
    console.error("No se pudo guardar la caché local de apariencia:", error);
  }
  return nextMode;
};
