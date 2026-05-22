/**
 * Telefones dos admins/suporte dos grupos WhatsApp do Bruno.
 * Esses números entram em todos os grupos mas NÃO devem contar como
 * leads/membros nas métricas e nem bater como comprador no grupo.
 *
 * Mantido aqui no código (não em env) porque a lista é estável e raramente
 * muda. Se mudar, basta adicionar/remover aqui e re-importar/re-rodar sync.
 *
 * Confirmado com Bruno em 2026-05-21.
 */
import { normalizePhone } from "@/lib/utils/phone";

const RAW_ADMINS = [
  { name: "SUP 04", phone: "+55 11 93331-1829" },
  { name: "Sup OBA 3", phone: "+55 11 97401-3023" },
  { name: "Sup Oba", phone: "+55 21 99661-8758" },
  { name: "Tiago 2", phone: "+55 14 99783-6885" },
  { name: "Claudia Rodrigues", phone: "+55 11 97493-0152" },
  // Também pegamos esses 4 nas admins da release CAPTAÇÃO via API SendFlow:
  { name: "Bruno P.", phone: "+55 15 99759-9533" },
  { name: "Sup Oba (admin SendFlow)", phone: "+55 21 99661-8758" },
  { name: "Tiago 2 (alt)", phone: "+55 14 99783-6885" },
];

export const ADMIN_PHONES_E164: ReadonlySet<string> = new Set(
  RAW_ADMINS.map((a) => normalizePhone(a.phone)).filter(
    (p): p is string => p !== null,
  ),
);

export function isAdminPhone(phoneE164: string | null | undefined): boolean {
  if (!phoneE164) return false;
  return ADMIN_PHONES_E164.has(phoneE164);
}
