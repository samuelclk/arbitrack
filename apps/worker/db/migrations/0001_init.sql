-- 4.1 ticks: raw per-venue per-symbol observations
CREATE TABLE ticks (
  venue        text        NOT NULL,
  symbol       text        NOT NULL,
  kind         text        NOT NULL,
  price        numeric,
  funding_rate numeric,
  expiry       timestamptz,
  ts           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol, kind, ts)
);
CREATE INDEX ticks_ts_idx ON ticks(ts DESC);

-- 4.2 opportunities: unified UI feed
CREATE TABLE opportunities (
  id           bigserial   PRIMARY KEY,
  category     text        NOT NULL,
  pair         text        NOT NULL,
  long_venue   text,
  short_venue  text,
  chain        text,
  spread_bps   numeric,
  apr_bps      numeric     NOT NULL,
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, pair, long_venue, short_venue, chain)
);
CREATE INDEX opp_cat_apr_idx ON opportunities(category, apr_bps DESC);

-- 4.3 spread_hourly: sparkline rollup
CREATE TABLE spread_hourly (
  category       text        NOT NULL,
  pair           text        NOT NULL,
  venue_key      text        NOT NULL,
  hour           timestamptz NOT NULL,
  spread_bps_avg numeric,
  spread_bps_max numeric,
  PRIMARY KEY (category, pair, venue_key, hour)
);

-- 4.4 lend_rates: per-venue per-chain per-asset
CREATE TABLE lend_rates (
  chain            text        NOT NULL,
  venue            text        NOT NULL,
  asset            text        NOT NULL,
  supply_apr_bps   numeric,
  borrow_apr_bps   numeric,
  ltv_bps          numeric,
  llt_bps          numeric,
  emode            boolean     NOT NULL DEFAULT false,
  borrowable       boolean     NOT NULL DEFAULT true,
  total_supply_usd numeric,
  total_borrow_usd numeric,
  ts               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, venue, asset, emode, ts)
);

-- 4.5 pendle_markets (wstETH only)
CREATE TABLE pendle_markets (
  chain               text        NOT NULL,
  market_addr         text        NOT NULL,
  underlying          text        NOT NULL,
  expiry              timestamptz NOT NULL,
  pt_implied_apy_bps  numeric     NOT NULL,
  yt_floating_apy_bps numeric,
  liquidity_usd       numeric,
  ts                  timestamptz NOT NULL,
  PRIMARY KEY (chain, market_addr, ts)
);

-- 4.6 lido_queue
CREATE TABLE lido_queue (
  ts                timestamptz NOT NULL PRIMARY KEY,
  unfinalized_steth numeric     NOT NULL,
  last_request_id   bigint      NOT NULL,
  last_finalized_id bigint      NOT NULL,
  est_wait_days     numeric     NOT NULL,
  bunker_mode       boolean     NOT NULL DEFAULT false,
  wait_source_type  text
);

-- 4.7 steth_apr
CREATE TABLE steth_apr (
  ts      timestamptz NOT NULL PRIMARY KEY,
  apr_bps numeric     NOT NULL,
  source  text        NOT NULL
);

-- 4.8 dex_prices
CREATE TABLE dex_prices (
  chain text        NOT NULL,
  dex   text        NOT NULL,
  pool  text        NOT NULL,
  base  text        NOT NULL,
  quote text        NOT NULL,
  price numeric     NOT NULL,
  ts    timestamptz NOT NULL,
  PRIMARY KEY (chain, dex, pool, ts)
);

-- 4.9 quarterly_futures
CREATE TABLE quarterly_futures (
  venue      text        NOT NULL,
  symbol     text        NOT NULL,
  expiry     timestamptz NOT NULL,
  fut_price  numeric     NOT NULL,
  spot_price numeric     NOT NULL,
  ts         timestamptz NOT NULL,
  PRIMARY KEY (venue, symbol, ts)
);
