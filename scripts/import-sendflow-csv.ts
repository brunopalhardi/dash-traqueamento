/**
 * Importa CSV de "Leads da Campanha" exportado pelo SendFlow → preenche
 * whatsapp_group_members pro matching buyer ↔ grupo funcionar.
 *
 * SendFlow REST não expõe endpoint pra listar membros — só via CSV manual
 * ou webhook. CSV é a fonte ideal pra snapshot retroativo.
 *
 * Formato esperado (separador `;`, BOM UTF-8):
 *   Posição;Grupo;Nome;Número;Saiu
 *   1;Desafio O Bom do Alzheimer T5 #1;;558199399329;Não;
 *
 * Comportamento:
 * - Pula admins (lib/sendflow/admins.ts)
 * - Normaliza phone (lib/utils/phone — garante 9 prefix BR)
 * - "Saiu = Sim" → currentlyInGroup = false
 * - Cria/upserta grupo "csv:<slug do nome>" pra cada grupo único do CSV
 * - Idempotente: re-import só atualiza estado, não duplica
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/import-sendflow-csv.ts <path.csv>
 *   npx tsx --env-file=.env.local scripts/import-sendflow-csv.ts <path.csv> --dry
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import { db } from "@/lib/db";
import { whatsappGroups, whatsappGroupMembers } from "@/lib/schema/whatsapp";
import { eq, sql } from "drizzle-orm";
import { normalizePhone } from "@/lib/utils/phone";
import { isAdminPhone } from "@/lib/sendflow/admins";

interface CsvRow {
  posicao: number;
  groupName: string;
  contactName: string | null;
  rawPhone: string;
  saiu: boolean;
}

function parseCsv(content: string): CsvRow[] {
  // Remove BOM se houver
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...dataLines] = lines; // pula header
  const rows: CsvRow[] = [];
  for (const line of dataLines) {
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const [posicao, groupName, contactName, rawPhone, saiu] = parts;
    rows.push({
      posicao: Number(posicao) || 0,
      groupName: groupName.trim(),
      contactName: contactName.trim() || null,
      rawPhone: rawPhone.trim(),
      saiu: saiu.trim().toLowerCase() === "sim",
    });
  }
  return rows;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

(async () => {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry");
  if (!csvPath) {
    console.error("USO: import-sendflow-csv.ts <path.csv> [--dry]");
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(content);
  console.log(`Mode: ${dry ? "DRY-RUN" : "REAL"}`);
  console.log(`CSV: ${csvPath} — ${rows.length} linhas`);

  // Agrupa por nome do grupo + valida e normaliza
  const byGroup = new Map<string, CsvRow[]>();
  let skippedAdmin = 0;
  let skippedInvalidPhone = 0;
  for (const r of rows) {
    const e164 = normalizePhone(r.rawPhone);
    if (!e164) {
      skippedInvalidPhone++;
      continue;
    }
    if (isAdminPhone(e164)) {
      skippedAdmin++;
      continue;
    }
    const list = byGroup.get(r.groupName) ?? [];
    list.push(r);
    byGroup.set(r.groupName, list);
  }

  console.log(`Grupos únicos: ${byGroup.size}`);
  console.log(`Admins pulados: ${skippedAdmin}`);
  console.log(`Phones inválidos pulados: ${skippedInvalidPhone}`);
  for (const [name, list] of byGroup) {
    const ativos = list.filter((r) => !r.saiu).length;
    console.log(`  ${name}: ${list.length} total (${ativos} ativos)`);
  }

  if (dry) {
    console.log("\nDRY-RUN — nada escrito.");
    process.exit(0);
  }

  // Upsert grupos "csv:<slug>"
  const now = new Date();
  let groupsCreated = 0;
  let membersUpserted = 0;
  for (const [groupName, list] of byGroup) {
    const externalId = `csv:${slugify(groupName)}`;
    const [{ id: groupId }] = await db
      .insert(whatsappGroups)
      .values({
        externalId,
        name: groupName,
      })
      .onConflictDoUpdate({
        target: whatsappGroups.externalId,
        set: { name: groupName, updatedAt: now },
      })
      .returning({ id: whatsappGroups.id });
    groupsCreated++;

    for (const r of list) {
      const e164 = normalizePhone(r.rawPhone)!;
      await db
        .insert(whatsappGroupMembers)
        .values({
          groupId,
          groupExternalId: externalId,
          phoneNormalized: e164,
          name: r.contactName,
          lastEventAt: now,
          lastEventType: r.saiu ? "left" : "joined",
          currentlyInGroup: !r.saiu,
        })
        .onConflictDoUpdate({
          target: [
            whatsappGroupMembers.groupExternalId,
            whatsappGroupMembers.phoneNormalized,
          ],
          set: {
            name: r.contactName ?? sql`${whatsappGroupMembers.name}`,
            lastEventAt: now,
            lastEventType: r.saiu ? "left" : "joined",
            currentlyInGroup: !r.saiu,
            updatedAt: now,
          },
        });
      membersUpserted++;
    }
  }

  console.log(
    `\nGrupos upsertados: ${groupsCreated} | Membros upsertados: ${membersUpserted}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
