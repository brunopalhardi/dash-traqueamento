/**
 * Normaliza telefone pra forma canônica usada em todo o app: só dígitos,
 * sempre com prefixo de país. Default Brasil (55) quando não vem.
 *
 * Aplica regras de BR pra garantir matching entre fontes diferentes
 * (webhook SendFlow, Hotmart API, CSV de leads):
 * - Remove "0" de discagem nacional após o DDI (ex: 550AABBBBBBBB → 55AABBBBBBBB)
 * - Garante "9" prefix em celular BR (ex: 55AA8DDDDDDD → 55AA98DDDDDDD)
 *   quando o número de assinante tem só 8 dígitos (formato antigo).
 *   Fix do caso CSV SendFlow vs Hotmart: CSV traz 558199399329 (sem 9),
 *   Hotmart traz 5581999399329 (com 9). Sem isso o match falha.
 *
 * Retorna `null` se não der pra extrair um telefone válido (<10 dígitos).
 */
export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  let digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;

  // Garante prefixo 55 (default BR)
  if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  // Strip "0" extra depois do DDI (formato discagem nacional 0AA → AA)
  // Ex: 550AABBBB... → 55AABBBB...
  if (digits.length >= 13 && digits[2] === "0") {
    digits = "55" + digits.slice(3);
  }

  // BR celular sempre tem "9" antes dos 8 dígitos do assinante.
  // Após DDI+DDD (4 chars), número de celular tem 9 dígitos começando em 9.
  // Se temos 12 dígitos totais (55+DDD+8), é formato antigo — insere o 9.
  // Só insere se o 5º dígito (1º do número) for 6/7/8/9 (range celular).
  if (digits.length === 12) {
    const firstDigit = digits[4];
    if (["6", "7", "8", "9"].includes(firstDigit)) {
      digits = digits.slice(0, 4) + "9" + digits.slice(4);
    }
  }

  return digits;
}
