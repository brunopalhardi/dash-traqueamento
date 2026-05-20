export interface MetaPaging {
  cursors?: { before?: string; after?: string };
  next?: string;
  previous?: string;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export interface MetaUser {
  id: string;
  name: string;
}

export interface MetaAdAccount {
  id: string; // "act_123..."
  account_id: string; // "123..."
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1=active, 2=disabled, etc.
  business?: { id: string; name: string };
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSet {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  daily_budget?: string;
  optimization_goal?: string;
  targeting?: Record<string, unknown>;
}

export interface MetaAd {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  creative?: { id: string };
  preview_shareable_link?: string;
}

export interface MetaCreative {
  id: string;
  name?: string;
  thumbnail_url?: string;
  /** Alta resolução — original do criativo (poster pra vídeo). Preferido a thumbnail_url. */
  image_url?: string;
  video_id?: string;
  object_type?: string; // "VIDEO" | "PHOTO" | "SHARE" | ...
  title?: string;
  body?: string;
  call_to_action_type?: string;
}

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  ad_id: string;
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  // video_play_actions contém action_type "video_view" cujo valor JÁ É o
  // 3-sec view count (definição da Meta: "video view" = ≥3 segundos).
  // Não existe field separado tipo "video_3_sec_views" — confirmado no SDK
  // oficial do Facebook (facebook-python-business-sdk/adsinsights.py).
  video_play_actions?: MetaInsightAction[];
  // Percentis SÃO fields top-level (arrays de actions com action_type
  // "video_view"). Confirmados válidos na v25 via Python SDK oficial.
  video_p25_watched_actions?: MetaInsightAction[];
  video_p50_watched_actions?: MetaInsightAction[];
  video_p75_watched_actions?: MetaInsightAction[];
  video_p95_watched_actions?: MetaInsightAction[];
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
}

export type DatePreset = "yesterday" | "last_3d" | "last_7d" | "last_30d";
