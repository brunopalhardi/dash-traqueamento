/**
 * Endpoint público de captura de lead.
 *
 * Chamado pelo /public/track.js no submit do form da LP (ou pela
 * própria LP / checkout) com os UTMs salvos no cookie + dados de
 * contato do usuário.
 *
 * Não tem auth — qualquer um pode chamar. Mitigamos com:
 *  - normalização e dedupe por email/phone + landingUrl + janela curta
 *    (insert simples; dedupe posterior pelo job de match)
 *  - rate limit (TODO — botar quando começar a ter volume)
 *
 * CORS aberto pra * porque a LP pode estar em qualquer domínio (Hotmart,
 * landing própria, etc).
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema/leads";
import { normalizePhone } from "@/lib/utils/phone";

export const dynamic = "force-dynamic";

interface TrackPayload {
  email?: string;
  phone?: string;
  name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbp_cookie?: string;
  landing_url?: string;
}

function normalizeEmail(s?: string): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (!t.includes("@")) return null;
  return t;
}

function classifySource(
  utmMedium?: string,
  utmSource?: string,
  fbclid?: string,
): "meta" | "organic" | "unknown" {
  if (fbclid) return "meta";
  const src = utmSource?.toLowerCase();
  const med = utmMedium?.toLowerCase();
  // Convenção real da planilha do Bruno: utm_source=MetaAds|Organico
  if (src === "metaads" || src === "meta_ads" || src === "meta-ads") return "meta";
  if (src === "organico" || src === "orgânico") return "organic";
  // Convenção genérica (mantida pra compat)
  if (med === "paid" || src?.startsWith("paid_")) return "meta";
  if (med === "organic" || src?.startsWith("organic_")) return "organic";
  return "unknown";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  let payload: TrackPayload;
  try {
    payload = (await req.json()) as TrackPayload;
  } catch {
    return NextResponse.json(
      { error: "invalid json" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  if (!email && !phone) {
    return NextResponse.json(
      { error: "email or phone required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const ua = req.headers.get("user-agent") ?? null;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const source = classifySource(payload.utm_medium, payload.utm_source, payload.fbclid);

  const [inserted] = await db
    .insert(leads)
    .values({
      emailNormalized: email,
      phoneNormalized: phone,
      name: payload.name?.trim() || null,
      source,
      utmSource: payload.utm_source ?? null,
      utmMedium: payload.utm_medium ?? null,
      utmCampaign: payload.utm_campaign ?? null,
      utmContent: payload.utm_content ?? null,
      fbclid: payload.fbclid ?? null,
      fbpCookie: payload.fbp_cookie ?? null,
      landingUrl: payload.landing_url ?? null,
      ip,
      userAgent: ua,
    })
    .returning({ id: leads.id });

  return NextResponse.json(
    { ok: true, leadId: inserted.id, source },
    { headers: corsHeaders() },
  );
}
