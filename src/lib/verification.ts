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

export function generateVerificationCode(
  documentType: string,
  opdName: string,
  title: string,
  printedBy?: string,
  metadata?: Record<string, any>
) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `BAGORMJ-${dateStr}-${randomHash}`;
  
  const record: VerificationRecord = {
    code,
    documentType,
    opdName,
    title,
    createdAt: new Date().toISOString(),
    printedBy: printedBy || 'Operator Sianjab',
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
