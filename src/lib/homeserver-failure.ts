/**
 * Klasifikasi kegagalan Homeserver: apakah layak fallback ke GAS + RTDB?
 *
 * Funnel/proxy yang mati mengembalikan 502/503/504 (bukan error bisnis), dan
 * fetch yang gagal total tidak punya status. Keduanya harus dianggap gangguan
 * jaringan agar frontend fallback ke GAS, bukan menampilkan data kosong.
 */
export function isHomeserverNetworkFailure(status: number, message: string): boolean {
  if (status === 0) return true;
  if (status >= 500) return true;
  const msg = String(message || '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('Request Timeout') ||
    msg.includes('Homeserver sedang OFF')
  );
}
