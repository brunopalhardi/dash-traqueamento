import { describe, it, expect } from "vitest";
import { extractLandingUrl } from "./extractors";
import type { MetaCreative } from "./types";

describe("extractLandingUrl", () => {
  it("retorna null para criativo sem specs", () => {
    expect(extractLandingUrl({ id: "1" })).toBeNull();
  });

  it("extrai de object_story_spec.link_data.link (imagem single)", () => {
    const creative: MetaCreative = {
      id: "1",
      object_story_spec: {
        link_data: { link: "https://guia-alzheimer-v1.lovable.app/" },
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v1.lovable.app/");
  });

  it("extrai de object_story_spec.video_data.call_to_action.value.link (vídeo)", () => {
    const creative: MetaCreative = {
      id: "2",
      object_story_spec: {
        video_data: {
          call_to_action: {
            type: "LEARN_MORE",
            value: { link: "https://guia-alzheimer-v2.lovable.app/" },
          },
        },
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v2.lovable.app/");
  });

  it("extrai de asset_feed_spec.link_urls[0].website_url (Advantage+)", () => {
    const creative: MetaCreative = {
      id: "3",
      asset_feed_spec: {
        link_urls: [
          { website_url: "https://guia-alzheimer-v3.lovable.app/" },
          { website_url: "https://outra.lovable.app/" },
        ],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://guia-alzheimer-v3.lovable.app/");
  });

  it("prefere object_story_spec quando ambos estão presentes", () => {
    const creative: MetaCreative = {
      id: "4",
      object_story_spec: { link_data: { link: "https://primary.lovable.app/" } },
      asset_feed_spec: {
        link_urls: [{ website_url: "https://fallback.lovable.app/" }],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://primary.lovable.app/");
  });

  it("ignora strings vazias e descarta para próximo path", () => {
    const creative: MetaCreative = {
      id: "5",
      object_story_spec: { link_data: { link: "" } },
      asset_feed_spec: {
        link_urls: [{ website_url: "https://fallback.lovable.app/" }],
      },
    };
    expect(extractLandingUrl(creative)).toBe("https://fallback.lovable.app/");
  });
});
