"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X, Minus, Mail } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "./format";
import { BuyerDrawer } from "./buyer-drawer";
import type { BuyerRow } from "@/lib/queries/purchases";

interface Props {
  buyers: BuyerRow[];
  /** Mostra coluna "No grupo" (só faz sentido no /desafio) */
  showInGroup?: boolean;
}

function formatPhone(e164: string | null): string {
  if (!e164) return "—";
  // 5511987654321 → +55 11 98765-4321 (visualização BR padrão, número completo)
  if (e164.length < 12) return `+${e164}`;
  const cc = e164.slice(0, 2);
  const ddd = e164.slice(2, 4);
  const rest = e164.slice(4);
  // Quebra rest em head-tail no 5º dígito (celular BR: 9XXXX-XXXX)
  if (rest.length === 9) {
    return `+${cc} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  // Fallback (fixo 8 dígitos, ou formato inesperado)
  return `+${cc} ${ddd} ${rest.slice(0, -4)}-${rest.slice(-4)}`;
}

function whatsappLink(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164}` : null;
}

function dateOnly(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function BuyersTable({ buyers, showInGroup = false }: Props) {
  const [selected, setSelected] = useState<BuyerRow | null>(null);

  if (buyers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum comprador aprovado no período.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {showInGroup && <TableHead className="text-center">No grupo</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {buyers.map((b) => {
            const link = whatsappLink(b.buyerPhoneE164);
            return (
              <TableRow
                key={b.transactionId}
                onClick={() => setSelected(b)}
                className="cursor-pointer hover:bg-accent/40"
              >
                <TableCell className="tabular-nums text-sm">
                  {fmt.shortDate(dateOnly(b.purchasedAt))}
                </TableCell>
                <TableCell className="font-medium">{b.buyerName ?? "—"}</TableCell>
                <TableCell>
                  {link ? (
                    <Link
                      href={link}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                    >
                      {formatPhone(b.buyerPhoneE164)}
                    </Link>
                  ) : b.buyerEmail ? (
                    <a
                      href={`mailto:${b.buyerEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors text-sm"
                      title="Hotmart não enviou telefone — usando email"
                    >
                      <Mail className="h-3 w-3" />
                      <span className="truncate max-w-[200px]">{b.buyerEmail}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.valueCents != null ? fmt.money(b.valueCents / 100) : "—"}
                </TableCell>
                {showInGroup && (
                  <TableCell className="text-center">
                    {b.inGroup === true ? (
                      <Check className="inline h-4 w-4 text-emerald-500" />
                    ) : b.inGroup === false ? (
                      <X className="inline h-4 w-4 text-rose-500" />
                    ) : (
                      <Minus className="inline h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <BuyerDrawer buyer={selected} onClose={() => setSelected(null)} />
    </>
  );
}
