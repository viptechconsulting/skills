import { DateTime } from "luxon";

export interface AllowedWindow {
  /** Hora local en formato "HH:mm", ej. "09:00" */
  start: string;
  /** Hora local en formato "HH:mm", ej. "19:00" */
  end: string;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: string): boolean {
  return TIME_REGEX.test(value);
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/**
 * Determina si un instante (UTC ISO o Date) cae dentro de la ventana horaria
 * permitida, evaluada en la zona horaria local del prospecto. Soporta
 * ventanas que cruzan medianoche (ej. 22:00 - 02:00).
 */
export function isWithinAllowedWindow(
  instantUtc: Date,
  timezone: string,
  window: AllowedWindow,
): boolean {
  if (!isValidTimeString(window.start) || !isValidTimeString(window.end)) {
    throw new Error(`Ventana horaria inválida: ${window.start}-${window.end}`);
  }

  const local = DateTime.fromJSDate(instantUtc, { zone: timezone });
  if (!local.isValid) {
    throw new Error(`Zona horaria inválida: ${timezone} (${local.invalidReason})`);
  }

  const nowMinutes = local.hour * 60 + local.minute;
  const startMinutes = toMinutes(window.start);
  const endMinutes = toMinutes(window.end);

  if (startMinutes === endMinutes) {
    // Ventana de 24h.
    return true;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Ventana que cruza medianoche, ej. 22:00 - 02:00.
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Calcula el próximo instante (UTC) dentro de la ventana permitida a partir
 * de `fromUtc`, buscando día por día hasta `maxDaysLookahead`.
 */
export function nextInstantWithinWindow(
  fromUtc: Date,
  timezone: string,
  window: AllowedWindow,
  maxDaysLookahead = 14,
): Date {
  if (isWithinAllowedWindow(fromUtc, timezone, window)) {
    return fromUtc;
  }

  const cursor = DateTime.fromJSDate(fromUtc, { zone: timezone });
  if (!cursor.isValid) {
    throw new Error(`Zona horaria inválida: ${timezone}`);
  }

  for (let day = 0; day <= maxDaysLookahead; day += 1) {
    const dayCursor = day === 0 ? cursor : cursor.plus({ days: day }).startOf("day");
    const startParts = window.start.split(":");
    const h = Number(startParts[0] ?? 0);
    const m = Number(startParts[1] ?? 0);
    const candidate = dayCursor.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    const candidateUtc = candidate.toUTC().toJSDate();
    if (candidateUtc.getTime() >= fromUtc.getTime() || day > 0) {
      if (isWithinAllowedWindow(candidateUtc, timezone, window) && candidateUtc.getTime() >= fromUtc.getTime()) {
        return candidateUtc;
      }
    }
  }

  throw new Error("No se encontró un horario permitido dentro del rango de búsqueda");
}
