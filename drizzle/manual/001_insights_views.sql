-- Agregação por adset
CREATE MATERIALIZED VIEW IF NOT EXISTS adset_insights_daily AS
SELECT
  a.adset_id,
  i.date,
  SUM(i.impressions) AS impressions,
  SUM(i.clicks) AS clicks,
  SUM(i.spend)::numeric(14,2) AS spend,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.spend) / SUM(i.impressions) * 1000)::numeric(14,4)
       ELSE NULL END AS cpm,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(8,4)
       ELSE NULL END AS ctr,
  SUM(i.link_clicks) AS link_clicks,
  SUM(i.video_views) AS video_views
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
GROUP BY a.adset_id, i.date;

CREATE UNIQUE INDEX IF NOT EXISTS adset_insights_daily_uq
  ON adset_insights_daily(adset_id, date);

-- Agregação por campanha
CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_insights_daily AS
SELECT
  s.campaign_id,
  i.date,
  SUM(i.impressions) AS impressions,
  SUM(i.clicks) AS clicks,
  SUM(i.spend)::numeric(14,2) AS spend,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.spend) / SUM(i.impressions) * 1000)::numeric(14,4)
       ELSE NULL END AS cpm,
  CASE WHEN SUM(i.impressions) > 0
       THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(8,4)
       ELSE NULL END AS ctr,
  SUM(i.link_clicks) AS link_clicks
FROM ad_insights_daily i
JOIN ads a ON a.id = i.ad_id
JOIN adsets s ON s.id = a.adset_id
GROUP BY s.campaign_id, i.date;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_insights_daily_uq
  ON campaign_insights_daily(campaign_id, date);
