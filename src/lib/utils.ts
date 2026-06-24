/**
 * Utility functions for Sianjab ABK
 */

/**
 * Returns current timestamp formatted to Western Indonesia Time (WIB)
 * Example output: "2026-06-24 12:05:30 WIB"
 */
export const getWibTimestamp = (): string => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
    
    const day = getPart("day");
    const month = getPart("month");
    const year = getPart("year");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second} WIB`;
  } catch (err) {
    // Basic fallback if Intl is not fully supported or throws an error
    const now = new Date();
    // UTC time + 7 hours for WIB
    const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const isoString = wibDate.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"
    const datePart = isoString.split('T')[0];
    const timePart = isoString.split('T')[1].substring(0, 8);
    return `${datePart} ${timePart} WIB`;
  }
};
