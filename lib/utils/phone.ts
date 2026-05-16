/**
 * Normaliza telefone pra forma canônica usada em todo o app: só dígitos,
 * sempre com prefixo de país. Default Brasil (55) quando não vem.
 *
 * Retorna `null` se não der pra extrair um telefone válido (<10 dígitos).
 */
export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}
