import type { MetaCreative } from "./types";

/**
 * Meta retorna a URL de destino do anúncio em 3 lugares diferentes,
 * dependendo do formato do criativo:
 *  - imagem single → object_story_spec.link_data.link
 *  - vídeo → object_story_spec.video_data.call_to_action.value.link
 *  - Advantage+ / asset feed → asset_feed_spec.link_urls[0].website_url
 *
 * Retorna a primeira string não-vazia ou null. Se houver múltiplas URLs
 * (asset feed), guarda só a primeira — mesmo comportamento do Looker.
 */
export function extractLandingUrl(creative: MetaCreative): string | null {
  const linkData = creative.object_story_spec?.link_data?.link;
  if (typeof linkData === "string" && linkData.length > 0) return linkData;

  const videoCta = creative.object_story_spec?.video_data?.call_to_action?.value?.link;
  if (typeof videoCta === "string" && videoCta.length > 0) return videoCta;

  const firstFeedUrl = creative.asset_feed_spec?.link_urls?.[0]?.website_url;
  if (typeof firstFeedUrl === "string" && firstFeedUrl.length > 0) return firstFeedUrl;

  return null;
}
