import Link from "next/link";
import { Check, X, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "./format";
import type { BuyerRow } from "@/lib/queries/purchases";

interface Props {
  buyers: BuyerRow[];
  /** Mostra coluna "No grupo" (só faz sentido no /desafio) */
  showInGroup?: boolean;
}

function maskPhone(e164: string | null): string {
  if (!e164) return "—";
  // 5511987654321 → +55 11 9****-4321
  if (e164.length < 10) return e164;
  const cc = e164.slice(0, 2);
  const ddd = e164.slice(2, 4);
  const head = e164.slice(4, 5);
  const tail = e164.slice(-4);
  return `+${cc} ${ddd} ${head}****-${tail}`;
}

function whatsappLink(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164}` : null;
}

export function BuyersTable({ buyers, showInGroup = false }: Props) {
  if (buyers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum comprador aprovado no período.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          {showInGroup && <TableHead className="text-center">No grupo</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {buyers.map((b) => {
          const link = whatsappLink(b.buyerPhoneE164);
          return (
            <TableRow key={b.transactionId}>
              <TableCell className="tabular-nums text-sm">
                {fmt.shortDate(b.purchasedAt.toISOString().slice(0, 10))}
              </TableCell>
              <TableCell className="font-medium">{b.buyerName ?? "—"}</TableCell>
              <TableCell>
                {link ? (
                  <Link href={link} target="_blank" className="text-primary hover:underline">
                    {maskPhone(b.buyerPhoneE164)}
                  </Link>
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
  );
}
