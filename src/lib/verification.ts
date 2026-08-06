export interface VerificationRecord {
  code: string;
  documentType: string;
  opdName: string;
  title: string;
  createdAt: string;
  printedBy?: string;
  metadata?: Record<string, any>;
}

export function createVerificationToken(record: VerificationRecord): string {
  try {
    return btoa(encodeURIComponent(JSON.stringify(record)));
  } catch (e) {
    console.error('Failed to encode token:', e);
    return '';
  }
}

export function parseVerificationToken(token: string): VerificationRecord | null {
  try {
    if (!token) return null;
    return JSON.parse(decodeURIComponent(atob(token))) as VerificationRecord;
  } catch (e) {
    console.error('Failed to parse token:', e);
    return null;
  }
}

/**
 * Resolves the root parent OPD (OPD Induk) from a raw OPD name or unitKerjaId by traversing parentId up to the root.
 */
export function resolveOpdInduk(
  rawOpdName?: string,
  opdsList?: Array<{ id: string; nama: string; parentId?: string }>
): string {
  if (!rawOpdName) return "Pemerintah Kabupaten Muaro Jambi";

  if (opdsList && opdsList.length > 0) {
    let current = opdsList.find(
      o => o.id === rawOpdName || o.nama.toLowerCase().trim() === rawOpdName.toLowerCase().trim()
    );
    if (current) {
      const visited = new Set<string>();
      while (current && current.parentId && current.parentId !== current.id && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = opdsList.find(o => o.id === current!.parentId);
        if (!parent) break;
        current = parent;
      }
      return current.nama;
    }
  }

  // Fallback pattern matching for sub-unit descriptions e.g. "Subbagian X pada Dinas Y"
  const padaMatch = rawOpdName.match(/pada\s+(dinas|badan|sekretariat|satuan|inspektorat|kecamatan\s+[^\n,]+)/i);
  if (padaMatch) {
    return padaMatch[0].replace(/^pada\s+/i, '').trim();
  }

  return rawOpdName;
}

/**
 * Gets the current logged-in user's name from localStorage session
 */
export function getCurrentSessionUser(): string {
  try {
    if (typeof window !== 'undefined') {
      const sessionStr = localStorage.getItem('sianjab_user');
      if (sessionStr) {
        const sessionUser = JSON.parse(sessionStr);
        if (sessionUser.namaLengkap) {
          const roleLabel = sessionUser.role === 'admin' ? 'Admin Kabupaten' : 'Operator OPD';
          return `${sessionUser.namaLengkap} (${roleLabel})`;
        } else if (sessionUser.username) {
          return sessionUser.username;
        }
      }
    }
  } catch (e) {
    console.error('Error reading sianjab_user from localStorage:', e);
  }
  return 'Operator Sianjab';
}

export function generateVerificationCode(
  documentType: string,
  opdNameParam: string,
  title: string,
  printedByParam?: string,
  metadata?: Record<string, any>,
  opdsList?: Array<{ id: string; nama: string; parentId?: string }>
) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `BAGORMJ-${dateStr}-${randomHash}`;
  
  // Resolve OPD Induk name
  const opdName = resolveOpdInduk(opdNameParam, opdsList);

  // Resolve printed by user
  let printedBy = printedByParam;
  if (!printedBy || printedBy === 'Operator Sianjab') {
    printedBy = getCurrentSessionUser();
  }

  const record: VerificationRecord = {
    code,
    documentType,
    opdName,
    title,
    createdAt: new Date().toISOString(),
    printedBy,
    metadata
  };

  const token = createVerificationToken(record);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sianjab.muarojambikab.go.id';
  const verifyUrl = `${origin}/verify?code=${record.code}&d=${token}`;

  try {
    const existingStr = typeof window !== 'undefined' ? localStorage.getItem('sianjab_verification_logs') : null;
    const logs: Record<string, VerificationRecord> = existingStr ? JSON.parse(existingStr) : {};
    logs[code] = record;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sianjab_verification_logs', JSON.stringify(logs));
    }
  } catch (e) {
    console.error('Failed to save verification record:', e);
  }

  return { record, verifyUrl, token };
}

export function getVerificationRecord(code: string, token?: string): VerificationRecord | null {
  if (token) {
    const parsed = parseVerificationToken(token);
    if (parsed && parsed.code === code) {
      return parsed;
    }
  }

  try {
    if (typeof window === 'undefined') return null;
    const existingStr = localStorage.getItem('sianjab_verification_logs');
    if (!existingStr) return null;
    const logs: Record<string, VerificationRecord> = JSON.parse(existingStr);
    return logs[code] || null;
  } catch (e) {
    console.error('Failed to read verification record:', e);
    return null;
  }
}
