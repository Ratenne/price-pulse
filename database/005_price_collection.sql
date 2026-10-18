-- =====================================================================
-- 005_price_collection.sql
-- PricePulse 가격 수집 스키마 (Supabase PostgreSQL)
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 후 Run (관리자 권한, 1회)
--   * 전체가 하나의 트랜잭션: 중간에 실패하면 아무것도 적용되지 않음
--   * 기존 테이블(products, product_source_mappings, price_histories,
--     price_history_exclusions, current_price_snapshots)은 읽기/참조만 하고 수정하지 않음
--   * 모든 신규 객체는 pc_ 접두사. 재실행해도 안전(idempotent)하나,
--     재실행 시 보안 구간이 pc_ 객체의 공개 권한을 다시 회수함
--
-- 용량: 행 수·MB 추정치는 이 파일에 확정값으로 적지 않음.
--       배포 후 select * from pc_capacity_test(); 로 실제 행 크기를 측정할 것.
-- 공개 노출: 기본 전부 비공개(anon/authenticated 접근 불가). 서버/service_role 경유.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. 설정 + 공용 헬퍼
-- ---------------------------------------------------------------------
create table if not exists pc_settings (
  key    text primary key,
  value  text not null,
  note   text
);

insert into pc_settings (key, value, note) values
  ('price_changes_retention_days',     '400', '가격 변경 이력 기본 보관일'),
  ('price_changes_min_retention_days', '90',  '용량 압박 시에도 유지할 최소 보관일'),
  ('daily_retention_days',             '400', '일별 가격 보관일'),
  ('runs_retention_days',              '30',  '수집 실행 로그 보관일'),
  ('day_status_keep_days',             '4',   '당일 관측 누적 테이블 보관일'),
  ('fresh_hours',                      '48',  '현재가로 인정하는 최대 경과 시간'),
  ('db_soft_limit_mb',                 '350', '이 값 초과 시 오래된 이력 파티션부터 정리 (무료 한도 기준, 플랜 정책 검증 필요)'),
  ('db_hard_limit_mb',                 '450', '이 값 이상이면 가격 반영 중단 (무료 한도 기준, 플랜 정책 검증 필요)')
on conflict (key) do nothing;

create or replace function pc_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((select nullif(btrim(s.value), '')::integer from pc_settings s where s.key = p_key), p_default)
$$;

-- 형식이 잘못된 시각 문자열은 null 로 처리 (배치 전체 실패 방지)
create or replace function pc_try_timestamptz(p text)
returns timestamptz
language plpgsql
stable
as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

-- 수집 주기: Tier1=6시간, Tier2=12시간, Tier3=24시간
create or replace function pc_tier_interval(p_tier smallint)
returns interval
language sql
immutable
as $$
  select case p_tier
           when 1 then interval '6 hours'
           when 2 then interval '12 hours'
           else interval '24 hours'
         end
$$;

-- ---------------------------------------------------------------------
-- 1. 쇼핑몰 / 수집 정책 (명시적 승인 없으면 절대 실행 불가)
-- ---------------------------------------------------------------------
create table if not exists pc_retailers (
  id    smallint generated always as identity primary key,
  code  text not null unique,
  name  text not null
);

insert into pc_retailers (code, name) values
  ('11ST',    '11번가'),
  ('COUPANG', '쿠팡'),
  ('GMARKET', 'G마켓'),
  ('AUCTION', '옥션')
on conflict (code) do nothing;

create table if not exists pc_source_policies (
  id                 smallint generated always as identity primary key,
  retailer_id        smallint not null references pc_retailers(id) on delete cascade,
  access_method      text     not null check (access_method in ('API', 'CRAWL')),
  approval_status    text     not null default 'pending'
                       check (approval_status in ('pending', 'approved', 'rejected', 'suspended')),
  allowed            boolean  not null default false,   -- 수집 허용
  storage_allowed    boolean  not null default false,   -- DB 저장·재사용 허용
  requires_fixed_ip  boolean  not null default false,   -- true 면 GitHub Actions 실행 금지
  terms_url          text,
  evidence_note      text,
  verified_at        date,                              -- 약관/API 검증일 (미검증 = null)
  approved_by        text,
  approved_at        timestamptz,
  expires_at         date,                              -- 재검증 기한 (지나면 자동 차단)
  updated_at         timestamptz not null default now(),
  unique (retailer_id, access_method),
  -- 승인 상태가 되려면 검증일·승인자·승인시각·근거 URL·허용 플래그가 모두 필요
  constraint pc_policy_approved_complete check (
    approval_status <> 'approved' or (
      allowed and storage_allowed
      and verified_at is not null
      and approved_at is not null
      and coalesce(btrim(approved_by), '') <> ''
      and coalesce(btrim(terms_url), '') <> ''
    )
  )
);

-- 전 쇼핑몰 x (API, CRAWL) 를 pending / 차단 상태로 시드
insert into pc_source_policies (retailer_id, access_method)
select r.id, m.method
from pc_retailers r
cross join (values ('API'), ('CRAWL')) as m(method)
on conflict (retailer_id, access_method) do nothing;

-- 실행 가능 여부의 단일 판정 함수 (수집 대상 선별과 가격 반영 양쪽에서 사용)
create or replace function pc_source_runnable(p_retailer_id smallint, p_access_method text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select sp.approval_status = 'approved'
       and sp.allowed
       and sp.storage_allowed
       and not sp.requires_fixed_ip
       and sp.verified_at is not null
       and (sp.expires_at is null or sp.expires_at >= (now() at time zone 'Asia/Seoul')::date)
    from pc_source_policies sp
    where sp.retailer_id = p_retailer_id
      and sp.access_method = p_access_method
  ), false)
$$;

create or replace function pc_approve_source(
  p_retailer_code      text,
  p_access_method      text,
  p_approved_by        text,
  p_terms_url          text,
  p_evidence_note      text    default null,
  p_expires_at         date    default null,
  p_requires_fixed_ip  boolean default false
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_rid smallint;
begin
  select id into v_rid from pc_retailers where code = upper(p_retailer_code);
  if v_rid is null then
    raise exception 'unknown retailer: %', p_retailer_code;
  end if;
  if coalesce(btrim(p_approved_by), '') = '' or coalesce(btrim(p_terms_url), '') = '' then
    raise exception 'approved_by and terms_url are required';
  end if;

  update pc_source_policies
     set approval_status   = 'approved',
         allowed           = true,
         storage_allowed   = true,
         requires_fixed_ip = p_requires_fixed_ip,
         terms_url         = p_terms_url,
         evidence_note     = p_evidence_note,
         verified_at       = (now() at time zone 'Asia/Seoul')::date,
         approved_by       = p_approved_by,
         approved_at       = now(),
         expires_at        = p_expires_at,
         updated_at        = now()
   where retailer_id = v_rid and access_method = upper(p_access_method);

  if not found then
    raise exception 'no policy row for % / %', p_retailer_code, p_access_method;
  end if;
end;
$$;

create or replace function pc_suspend_source(p_retailer_code text, p_access_method text, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
begin
  update pc_source_policies sp
     set approval_status = 'suspended',
         allowed         = false,
         evidence_note   = coalesce(p_reason, sp.evidence_note),
         updated_at      = now()
   from pc_retailers r
   where r.id = sp.retailer_id
     and r.code = upper(p_retailer_code)
     and sp.access_method = upper(p_access_method);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 상품 브릿지 (기존 products.id(text) 와 연결, 기존 테이블은 수정하지 않음)
-- ---------------------------------------------------------------------
create table if not exists pc_products (
  id          integer generated always as identity primary key,
  product_id  text not null unique references products(id),   -- 기존 상품 ID
  brand       text,
  model       text not null check (length(btrim(model)) > 0),
  mpn         text,                                           -- 제조사 부품번호
  variant     text,                                           -- 옵션 (용량, 색상, 구성 등)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  -- 정규화 키: 대소문자/공백/구분기호 차이 무시
  brand_key    text generated always as (
    coalesce(regexp_replace(lower(btrim(brand)), '\s+', ' ', 'g'), '')
  ) stored,
  mpn_key      text generated always as (
    nullif(regexp_replace(lower(btrim(coalesce(mpn, ''))), '[\s\-_/.]+', '', 'g'), '')
  ) stored,
  model_key    text generated always as (
    regexp_replace(lower(btrim(model)), '[\s\-_/.]+', '', 'g')
  ) stored,
  variant_key  text generated always as (
    coalesce(regexp_replace(lower(btrim(variant)), '[\s\-_/.]+', '', 'g'), '')
  ) stored
);

-- 모델번호(MPN)가 있으면 제조사 + MPN + 옵션 단위로 유일
create unique index if not exists pc_products_mpn_variant_uq
  on pc_products (brand_key, mpn_key, variant_key)
  where mpn_key is not null;

-- MPN 이 없으면 제조사 + 모델명 + 옵션 단위로 유일
create unique index if not exists pc_products_model_variant_uq
  on pc_products (brand_key, model_key, variant_key)
  where mpn_key is null;

create index if not exists pc_products_active_idx
  on pc_products (id) where is_active;

-- ---------------------------------------------------------------------
-- 3. 쇼핑몰별 상품(listing): 현재 상태만 보관
-- ---------------------------------------------------------------------
create table if not exists pc_listings (
  id               integer generated always as identity primary key,
  last_ok_at       timestamptz,      -- 마지막 '성공' 관측 시각
  last_attempt_at  timestamptz,      -- 마지막 시도 시각 (성공/실패 모두)
  last_changed_at  timestamptz,      -- 마지막 가격 변경 시각
  created_at       timestamptz not null default now(),
  product_id       integer  not null references pc_products(id) on delete cascade,
  current_price    integer  check (current_price is null or current_price between 1 and 2000000000),
  retailer_id      smallint not null,
  tier             smallint not null default 2 check (tier in (1, 2, 3)),
  fail_count       smallint not null default 0,
  access_method    text     not null default 'API' check (access_method in ('API', 'CRAWL')),
  status           text     not null default 'active'
                     check (status in ('active', 'soldout', 'removed', 'error')),
  external_id      text     not null check (length(btrim(external_id)) > 0),
  url              text     not null,
  unique (retailer_id, external_id),
  -- 정책 행이 반드시 존재해야 listing 등록 가능
  foreign key (retailer_id, access_method)
    references pc_source_policies (retailer_id, access_method)
) with (fillfactor = 85);

create index if not exists pc_listings_product_idx
  on pc_listings (product_id) include (current_price, retailer_id)
  where status = 'active';

create index if not exists pc_listings_due_idx
  on pc_listings (retailer_id, tier)
  where status in ('active', 'soldout');

-- ---------------------------------------------------------------------
-- 4. 가격 변경 이력: 월 파티션 (오래된 파티션 DROP 으로 용량 즉시 회수)
-- ---------------------------------------------------------------------
create table if not exists pc_price_changes (
  observed_at  timestamptz not null,
  listing_id   integer     not null references pc_listings(id) on delete cascade,
  price        integer     not null check (price between 1 and 2000000000),
  prev_price   integer,
  primary key (listing_id, observed_at)
) partition by range (observed_at);

-- 이번 달 -1개월 ~ +N개월 파티션 생성 (한국시간 월 경계). 새 파티션도 즉시 비공개 처리.
create or replace function pc_ensure_price_change_partitions(p_months_ahead integer default 2)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_base date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_m    date;
  v_part text;
  v_n    integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('pc_ensure_price_change_partitions'));

  for i in -1..greatest(p_months_ahead, 0) loop
    v_m    := (v_base + make_interval(months => i))::date;
    v_part := 'pc_price_changes_' || to_char(v_m, 'YYYYMM');

    if to_regclass(format('public.%I', v_part)) is null then
      execute format(
        'create table public.%I partition of public.pc_price_changes for values from (%L) to (%L)',
        v_part,
        ((v_m::timestamp) at time zone 'Asia/Seoul')::text,
        (((v_m + interval '1 month')::timestamp) at time zone 'Asia/Seoul')::text
      );
      -- Supabase 기본 권한이 새 테이블을 anon/authenticated 에 열어두므로 즉시 회수
      execute format('alter table public.%I enable row level security', v_part);
      execute format('revoke all on table public.%I from anon, authenticated', v_part);
      execute format('grant all on table public.%I to service_role', v_part);
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$$;

do $$ begin perform pc_ensure_price_change_partitions(3); end $$;

-- ---------------------------------------------------------------------
-- 5. 검토된 이상 가격 제외 / 당일 관측 누적 / 일별 가격 / 현재가 / 실행 로그
-- ---------------------------------------------------------------------

-- 기존 price_history_exclusions 와 같은 방식: listing + '검토한 가격 값' 에 연결
-- 예) insert into pc_price_exclusions (listing_id, observed_price, reason) values (123, 66207920, '확인 대기');
create table if not exists pc_price_exclusions (
  listing_id      integer not null references pc_listings(id) on delete cascade,
  observed_price  integer not null check (observed_price > 0),
  reason          text    not null check (length(btrim(reason)) > 0),
  reviewed_at     timestamptz not null default now(),
  revoked_at      timestamptz,
  primary key (listing_id, observed_price)
);

-- listing x 날짜 단위 '당일 관측' 누적 (최근 며칠만 유지)
-- ok_n: 유효 가격 관측 / unavail_n: 품절·삭제 확인 / fail_n: 수집 실패·무효 값
-- 행이 아예 없으면 '미수집'
create table if not exists pc_listing_day_status (
  status_date  date    not null,
  listing_id   integer not null references pc_listings(id) on delete cascade,
  low_price    integer,
  high_price   integer,
  last_price   integer,
  ok_n         smallint not null default 0,
  unavail_n    smallint not null default 0,
  fail_n       smallint not null default 0,
  primary key (listing_id, status_date)
) with (fillfactor = 80);

-- 상품 x 날짜 1행. 가격이 없는 날(전부 실패/미수집)도 data_status=0 행으로 남겨 '공백'을 구분
create table if not exists pc_daily_prices (
  price_date            date    not null,
  product_id            integer not null references pc_products(id) on delete cascade,
  low_price             integer,     -- 당일 관측된 최저가
  high_price            integer,     -- 당일 관측된 최고가
  avg_price             integer,     -- listing별 마지막 관측가 평균
  last_low_price        integer,     -- listing별 마지막 관측가 중 최저
  min_listing_id        integer,     -- 당일 최저가를 관측한 listing
  ok_listings           smallint not null default 0,
  unavailable_listings  smallint not null default 0,
  failed_listings       smallint not null default 0,
  missing_listings      smallint not null default 0,   -- 시도 자체가 없던 listing
  data_status           smallint not null default 0 check (data_status in (0, 1, 2)),  -- 0=데이터없음 1=부분 2=완전
  primary key (product_id, price_date),
  check ((low_price is null) = (high_price is null)),
  check (low_price is null or low_price <= high_price)
) with (fillfactor = 90);

-- 쇼핑몰 최저가 현재가. 기존 current_price_snapshots / products.current_price 는 덮어쓰지 않음
create table if not exists pc_product_current_price (
  product_id     text primary key references products(id),
  price          integer not null check (price between 1 and 2000000000),
  listing_id     integer,
  retailer_id    smallint,
  listing_count  smallint not null default 1,
  checked_at     timestamptz not null,      -- 사용된 listing 의 마지막 성공 관측 시각
  updated_at     timestamptz not null default now()
);

create table if not exists pc_collection_runs (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  retailer_id   smallint references pc_retailers(id),
  tier          smallint,
  access_method text,
  total_count   integer not null default 0,
  ok_count      integer not null default 0,
  fail_count    integer not null default 0,
  status        text not null default 'running'
                  check (status in ('running', 'success', 'partial', 'failed')),
  error         text check (error is null or length(error) <= 1000)
);

create index if not exists pc_collection_runs_started_idx
  on pc_collection_runs (started_at desc);

-- ---------------------------------------------------------------------
-- 6. 뷰 (관리/서버용, 공개 아님)
-- ---------------------------------------------------------------------
create or replace view pc_product_current
with (security_invoker = true) as
select cp.product_id,
       p.name,
       p.category,
       cp.price         as lowest_price,
       r.code           as retailer_code,
       cp.listing_count,
       cp.checked_at
from pc_product_current_price cp
join products p on p.id = cp.product_id
left join pc_retailers r on r.id = cp.retailer_id;

-- 전월(직전 값) 대비 3배 이상/1/3 이하 변동: 자동 제외하지 않고 사람이 검토하기 위한 목록
create or replace view pc_suspect_changes
with (security_invoker = true) as
select c.observed_at,
       c.listing_id,
       l.product_id,
       c.prev_price,
       c.price,
       round(c.price::numeric / c.prev_price, 2) as ratio
from pc_price_changes c
join pc_listings l on l.id = c.listing_id
where c.prev_price is not null
  and (c.price::bigint >= c.prev_price::bigint * 3 or c.price::bigint * 3 <= c.prev_price::bigint)
  and not exists (
    select 1 from pc_price_exclusions x
    where x.listing_id = c.listing_id
      and x.observed_price = c.price
      and x.revoked_at is null
  );

-- ---------------------------------------------------------------------
-- 7. 수집 대상 선별: 승인된 소스 + 티어별 주기(6h/12h/24h) + 실패 백오프
-- ---------------------------------------------------------------------
create or replace function pc_due_listings(
  p_retailer_code  text,
  p_access_method  text    default 'API',
  p_tier           integer default null,
  p_limit          integer default 500,
  p_shard          integer default 0,
  p_shards         integer default 1,
  p_slack_minutes  integer default 10      -- cron 지연 허용치
)
returns table (listing_id integer, external_id text, url text, tier smallint)
language sql
stable
set search_path = public
as $$
  select l.id, l.external_id, l.url, l.tier
  from pc_listings l
  join pc_retailers r
    on r.id = l.retailer_id and r.code = upper(p_retailer_code)
  where l.access_method = upper(p_access_method)
    and l.status in ('active', 'soldout')
    and pc_source_runnable(l.retailer_id, l.access_method)
    and (p_tier is null or l.tier = p_tier)
    and (l.id % greatest(p_shards, 1)) = p_shard
    -- 마지막 성공 관측 후 티어 주기가 지났는가
    and (l.last_ok_at is null
         or l.last_ok_at <= now() - (pc_tier_interval(l.tier) - make_interval(mins => greatest(p_slack_minutes, 0))))
    -- 실패한 listing 은 30분 x 2^실패횟수(최대 8시간, 티어 주기 이내)로 재시도 간격 확대
    and (l.last_attempt_at is null
         or l.last_attempt_at <= now() - least(
              pc_tier_interval(l.tier),
              make_interval(mins => 30 * (1 << least(l.fail_count::integer, 4)))))
  order by l.tier, l.last_ok_at nulls first, l.id
  limit least(greatest(p_limit, 1), 5000)
$$;

-- ---------------------------------------------------------------------
-- 8. 가격 일괄 반영 (중복 입력·동시 실행 안전)
--   입력: [{"listing_id":1,"price":1290000,"status":"active","observed_at":"2026-10-18T03:00:00Z"}, ...]
--   * 같은 listing 이 배치에 여러 번 있으면 observed_at 이 가장 최신인 1건만 사용
--   * 대상 listing 행을 id 순으로 먼저 잠근 뒤 판정 -> 동시 실행에서도 prev_price 정확
--   * 미승인 소스 / 이미 더 최신 관측이 있는 입력(stale) / 존재하지 않는 listing 은 반영하지 않음
--   * 무효 가격, 검토 제외 가격은 '실패'로 기록하고 현재가는 건드리지 않음
--   * status: active(가격 필수) | soldout | removed
-- ---------------------------------------------------------------------
create or replace function pc_ingest_prices(p_rows jsonb)
returns table (
  n_received  integer,
  n_ok        integer,
  n_changed   integer,
  n_rejected  integer,
  n_blocked   integer,
  n_stale     integer,
  n_unknown   integer,
  n_duplicate integer
)
language plpgsql
set search_path = public
as $$
declare
  v_ids integer[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'pc_ingest_prices: p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'pc_ingest_prices: max 5000 rows per call';
  end if;

  -- DB 용량이 hard 한도에 도달하면 반영 중단
  if pc_capacity_level() = 'hard' then
    raise exception 'PC_CAPACITY_HARD: DB size reached hard limit. Run pc_maintenance() and review retention.'
      using errcode = '54000';
  end if;

  -- 이번 달 파티션이 없으면 생성 (드문 DDL)
  if to_regclass('public.pc_price_changes_' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMM')) is null then
    perform pc_ensure_price_change_partitions();
  end if;

  -- 대상 listing 잠금 (id 순 -> 데드락 방지, 동시 실행 직렬화)
  select coalesce(array_agg(distinct x.lid), '{}'::integer[]) into v_ids
  from (
    select case when e ->> 'listing_id' ~ '^[0-9]{1,9}$' then (e ->> 'listing_id')::integer end as lid
    from jsonb_array_elements(p_rows) e
  ) x
  where x.lid is not null;

  perform 1 from pc_listings l where l.id = any (v_ids) order by l.id for update of l;

  -- 잠금 획득 후 새 스냅샷으로 판정/반영 (READ COMMITTED: 이전 트랜잭션 결과가 보임)
  return query
  with raw as (
    select e.ord,
           case when e.r ->> 'listing_id' ~ '^[0-9]{1,9}$' then (e.r ->> 'listing_id')::integer end as listing_id,
           case when e.r ->> 'price' ~ '^[0-9]{1,10}$' then (e.r ->> 'price')::bigint end            as price,
           lower(coalesce(nullif(btrim(e.r ->> 'status'), ''), 'active'))                            as status,
           -- 관측 시각은 최근 1일 ~ 현재로 제한 (파티션 범위 보장, 미래 시각 차단)
           least(greatest(coalesce(pc_try_timestamptz(e.r ->> 'observed_at'), now()),
                          now() - interval '1 day'), now())                                          as observed_at
    from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
  ),
  dedup as (
    select distinct on (r.listing_id) r.*
    from raw r
    where r.listing_id is not null
    order by r.listing_id, r.observed_at desc, r.ord desc
  ),
  cls as (
    select d.listing_id,
           d.status as req_status,
           d.observed_at,
           case when d.status = 'active' and d.price between 1 and 2000000000
                then d.price::integer end as vprice,
           l.id as l_id,
           l.product_id,
           l.current_price as old_price,
           case
             when l.id is null then 'unknown'
             when not pc_source_runnable(l.retailer_id, l.access_method) then 'blocked'
             when l.last_ok_at is not null and d.observed_at < l.last_ok_at then 'stale'
             when d.status not in ('active', 'soldout', 'removed') then 'rejected'
             when d.status = 'active' and (d.price is null or d.price not between 1 and 2000000000) then 'rejected'
             when d.status = 'active' and exists (
                    select 1 from pc_price_exclusions x
                    where x.listing_id = d.listing_id
                      and x.observed_price = d.price
                      and x.revoked_at is null) then 'rejected'
             else 'ok'
           end as outcome
    from dedup d
    left join pc_listings l on l.id = d.listing_id
  ),
  upd as (
    update pc_listings l
       set status          = case when c.outcome = 'ok' then c.req_status
                                  when l.fail_count + 1 >= 5 and l.status in ('active', 'soldout') then 'error'
                                  else l.status end,
           current_price   = case when c.outcome = 'ok' then coalesce(c.vprice, l.current_price)
                                  else l.current_price end,
           last_ok_at      = case when c.outcome = 'ok' then c.observed_at else l.last_ok_at end,
           last_attempt_at = now(),
           fail_count      = case when c.outcome = 'ok' then 0
                                  else least(l.fail_count + 1, 32000) end,
           last_changed_at = case when c.outcome = 'ok' and c.vprice is not null
                                       and c.vprice is distinct from c.old_price
                                  then c.observed_at else l.last_changed_at end
      from cls c
     where l.id = c.l_id
       and c.outcome in ('ok', 'rejected')
    returning l.id
  ),
  ins as (
    insert into pc_price_changes (observed_at, listing_id, price, prev_price)
    select c.observed_at, c.listing_id, c.vprice, c.old_price
    from cls c
    where c.outcome = 'ok'
      and c.vprice is not null
      and c.vprice is distinct from c.old_price
    on conflict (listing_id, observed_at) do update
      set price = excluded.price
    returning 1
  ),
  dst as (
    insert into pc_listing_day_status as t
      (status_date, listing_id, low_price, high_price, last_price, ok_n, unavail_n, fail_n)
    select ((case when c.outcome = 'ok' then c.observed_at else now() end) at time zone 'Asia/Seoul')::date,
           c.listing_id,
           c.vprice, c.vprice, c.vprice,
           (c.outcome = 'ok' and c.req_status = 'active')::integer,
           (c.outcome = 'ok' and c.req_status <> 'active')::integer,
           (c.outcome = 'rejected')::integer
    from cls c
    where c.outcome in ('ok', 'rejected')
    on conflict (listing_id, status_date) do update
      set low_price  = least(t.low_price, excluded.low_price),
          high_price = greatest(t.high_price, excluded.high_price),
          last_price = coalesce(excluded.last_price, t.last_price),
          ok_n       = least(t.ok_n + excluded.ok_n, 32000),
          unavail_n  = least(t.unavail_n + excluded.unavail_n, 32000),
          fail_n     = least(t.fail_n + excluded.fail_n, 32000)
    returning 1
  )
  select (select count(*) from raw)::integer,
         (select count(*) from cls where outcome = 'ok')::integer,
         (select count(*) from ins)::integer,
         (select count(*) from cls where outcome = 'rejected')::integer,
         (select count(*) from cls where outcome = 'blocked')::integer,
         (select count(*) from cls where outcome = 'stale')::integer,
         ((select count(*) from raw where listing_id is null)
          + (select count(*) from cls where outcome = 'unknown'))::integer,
         ((select count(*) from raw where listing_id is not null) - (select count(*) from dedup))::integer;
end;
$$;

-- 수집 실패 기록: '가격 유지'가 아니라 '실패'로 남김 (현재가/상태는 그대로, 5회 연속 시 error)
create or replace function pc_mark_failed(p_listing_ids integer[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_n integer;
begin
  perform 1 from pc_listings l where l.id = any (p_listing_ids) order by l.id for update of l;

  with u as (
    update pc_listings l
       set last_attempt_at = now(),
           fail_count      = least(l.fail_count + 1, 32000),
           status          = case when l.fail_count + 1 >= 5 and l.status in ('active', 'soldout')
                                  then 'error' else l.status end
     where l.id = any (p_listing_ids)
       and pc_source_runnable(l.retailer_id, l.access_method)
    returning l.id
  ),
  d as (
    insert into pc_listing_day_status as t (status_date, listing_id, fail_n)
    select (now() at time zone 'Asia/Seoul')::date, u.id, 1 from u
    on conflict (listing_id, status_date) do update
      set fail_n = least(t.fail_n + 1, 32000)
    returning 1
  )
  select count(*) into v_n from u;

  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. 일별 집계: 당일 관측 최저·최고가 누적 + 성공/실패/미수집 구분
--   * 같은 날짜에 여러 번 실행해도 결과가 동일 (pc_listing_day_status 기준으로 재계산)
--   * 승인된 소스의 listing 만 집계
--   * data_status: 0=유효 관측 없음, 1=일부 실패/미수집, 2=완전
-- ---------------------------------------------------------------------
create or replace function pc_rollup_daily(
  p_date date default ((now() at time zone 'Asia/Seoul')::date)
)
returns integer
language sql
set search_path = public
as $$
  with base as (
    select l.product_id,
           l.id as listing_id,
           ds.low_price, ds.high_price, ds.last_price,
           case when ds.ok_n > 0     then 1   -- 성공 관측
                when ds.unavail_n > 0 then 2   -- 품절/삭제 확인
                when ds.fail_n > 0   then 3   -- 시도했으나 실패
                else 4                         -- 미수집 (시도 기록 없음)
           end as res
    from pc_listings l
    left join pc_listing_day_status ds
           on ds.listing_id = l.id and ds.status_date = p_date
    where l.created_at < (((p_date + 1)::timestamp) at time zone 'Asia/Seoul')
      and (l.status in ('active', 'soldout') or ds.listing_id is not null)
      and pc_source_runnable(l.retailer_id, l.access_method)
  ),
  agg as (
    select b.product_id,
           min(b.low_price)  as low_price,
           max(b.high_price) as high_price,
           round(avg(b.last_price) filter (where b.res = 1))::integer as avg_price,
           min(b.last_price) filter (where b.res = 1)                 as last_low_price,
           (array_agg(b.listing_id order by b.low_price, b.listing_id)
              filter (where b.low_price is not null))[1]              as min_listing_id,
           count(*) filter (where b.res = 1) as ok_n,
           count(*) filter (where b.res = 2) as unavail_n,
           count(*) filter (where b.res = 3) as fail_n,
           count(*) filter (where b.res = 4) as missing_n
    from base b
    group by b.product_id
  ),
  up as (
    insert into pc_daily_prices as t
      (price_date, product_id, low_price, high_price, avg_price, last_low_price, min_listing_id,
       ok_listings, unavailable_listings, failed_listings, missing_listings, data_status)
    select p_date, a.product_id, a.low_price, a.high_price, a.avg_price, a.last_low_price, a.min_listing_id,
           a.ok_n, a.unavail_n, a.fail_n, a.missing_n,
           case when a.ok_n = 0 then 0
                when a.fail_n = 0 and a.missing_n = 0 then 2
                else 1 end
    from agg a
    on conflict (product_id, price_date) do update
      set low_price            = excluded.low_price,
          high_price           = excluded.high_price,
          avg_price            = excluded.avg_price,
          last_low_price       = excluded.last_low_price,
          min_listing_id       = excluded.min_listing_id,
          ok_listings          = excluded.ok_listings,
          unavailable_listings = excluded.unavailable_listings,
          failed_listings      = excluded.failed_listings,
          missing_listings     = excluded.missing_listings,
          data_status          = excluded.data_status
    returning 1
  )
  select count(*)::integer from up
$$;

-- ---------------------------------------------------------------------
-- 10. 현재가 동기화 (기존 current_price_snapshots / products.current_price 는 건드리지 않음)
-- ---------------------------------------------------------------------
create or replace function pc_sync_current_prices()
returns table (n_upserted integer, n_deleted integer)
language sql
set search_path = public
as $$
  with f as (
    select pr.product_id as pid, l.id as lid, l.retailer_id as rid, l.current_price as p, l.last_ok_at as ok_at
    from pc_listings l
    join pc_products pr on pr.id = l.product_id and pr.is_active
    where l.status = 'active'
      and l.current_price is not null
      and l.last_ok_at >= now() - make_interval(hours => pc_setting_int('fresh_hours', 48))
      and pc_source_runnable(l.retailer_id, l.access_method)
      and not exists (
        select 1 from pc_price_exclusions x
        where x.listing_id = l.id and x.observed_price = l.current_price and x.revoked_at is null)
  ),
  best as (
    select distinct on (f.pid) f.pid, f.lid, f.rid, f.p, f.ok_at
    from f order by f.pid, f.p, f.lid
  ),
  cnt as (
    select f.pid, count(*)::smallint as c from f group by f.pid
  ),
  up as (
    insert into pc_product_current_price as t
      (product_id, price, listing_id, retailer_id, listing_count, checked_at, updated_at)
    select b.pid, b.p, b.lid, b.rid, c.c, b.ok_at, now()
    from best b join cnt c on c.pid = b.pid
    on conflict (product_id) do update
      set price = excluded.price, listing_id = excluded.listing_id, retailer_id = excluded.retailer_id,
          listing_count = excluded.listing_count, checked_at = excluded.checked_at, updated_at = now()
    returning 1
  ),
  del as (
    delete from pc_product_current_price t
    where not exists (select 1 from best b where b.pid = t.product_id)
    returning 1
  )
  select (select count(*) from up)::integer, (select count(*) from del)::integer
$$;

-- ---------------------------------------------------------------------
-- 11. 용량 관리 (가격 변경 이력 400일 보관 + 무료 DB 한도 보호)
--   1) 보관기간(기본 400일) 초과 월 파티션 DROP
--   2) soft 한도 초과 시 가장 오래된 파티션부터 DROP (최소 보관일 이하로는 삭제하지 않음)
--   3) hard 한도 이상이면 pc_ingest_prices 가 가격 반영을 중단
--   * 일반 DELETE 는 파일 크기를 줄이지 못하므로 이력은 파티션 DROP 방식 사용
--   * DROP 은 해당 파티션에 짧은 락을 잡으므로 수집이 적은 시간대에 실행 권장
-- ---------------------------------------------------------------------
create or replace function pc_capacity_level()
returns text
language sql
stable
set search_path = public
as $$
  select case
           when s.mb >= pc_setting_int('db_hard_limit_mb', 450) then 'hard'
           when s.mb >= pc_setting_int('db_soft_limit_mb', 350) then 'soft'
           else 'ok'
         end
  from (select pg_database_size(current_database()) / 1048576.0 as mb) s
$$;

create or replace function pc_enforce_capacity()
returns table (step text, detail text)
language plpgsql
set search_path = public
as $$
declare
  v_today date   := (now() at time zone 'Asia/Seoul')::date;
  v_ret   integer := pc_setting_int('price_changes_retention_days', 400);
  v_min   integer := pc_setting_int('price_changes_min_retention_days', 90);
  v_soft  bigint  := pc_setting_int('db_soft_limit_mb', 350)::bigint * 1048576;
  v_size  bigint  := pg_database_size(current_database());
  v_bytes bigint;
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('pc_enforce_capacity'));

  for r in
    select c.oid,
           c.relname::text as part,
           (to_date(substring(c.relname::text from '([0-9]{6})$'), 'YYYYMM') + interval '1 month')::date as m_end
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.pc_price_changes'::regclass
    order by 3
  loop
    v_bytes := pg_total_relation_size(r.oid);

    if r.m_end <= v_today - v_ret then
      execute format('drop table public.%I', r.part);
      v_size := v_size - v_bytes;
      step := 'retention_drop'; detail := r.part || ' (' || pg_size_pretty(v_bytes) || ')'; return next;

    elsif v_size > v_soft and r.m_end <= v_today - v_min then
      execute format('drop table public.%I', r.part);
      v_size := v_size - v_bytes;
      step := 'pressure_drop'; detail := r.part || ' (' || pg_size_pretty(v_bytes) || ')'; return next;
    end if;
  end loop;

  step := 'estimated_size_after';
  detail := pg_size_pretty(v_size) || ' / soft limit ' || pg_size_pretty(v_soft);
  return next;

  if v_size > v_soft then
    step := 'warning';
    detail := 'soft limit still exceeded; no more price_changes partitions eligible (min retention '
              || v_min || ' days). Review daily/listing data or limits.';
    return next;
  end if;
end;
$$;

-- 정기 유지보수 (하루 1회 이상 권장): 파티션 준비 -> 최근 3일 롤업 -> 현재가 동기화 -> 정리 -> 용량 관리
create or replace function pc_maintenance()
returns table (step text, detail text)
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_n  bigint;
  v_n2 bigint;
begin
  step := 'partitions';
  detail := pc_ensure_price_change_partitions(2) || ' created';
  return next;

  for i in 0..2 loop
    v_n := pc_rollup_daily(v_today - i);
    step := 'rollup'; detail := (v_today - i)::text || ': ' || v_n || ' products'; return next;
  end loop;

  select s.n_upserted, s.n_deleted into v_n, v_n2 from pc_sync_current_prices() s;
  step := 'sync_current'; detail := v_n || ' upserted, ' || v_n2 || ' removed'; return next;

  delete from pc_daily_prices
   where price_date < v_today - pc_setting_int('daily_retention_days', 400);
  get diagnostics v_n = row_count;
  step := 'purge_daily'; detail := v_n || ' rows'; return next;

  delete from pc_listing_day_status
   where status_date < v_today - pc_setting_int('day_status_keep_days', 4);
  get diagnostics v_n = row_count;
  step := 'purge_day_status'; detail := v_n || ' rows'; return next;

  delete from pc_collection_runs
   where started_at < now() - make_interval(days => pc_setting_int('runs_retention_days', 30));
  get diagnostics v_n = row_count;
  step := 'purge_runs'; detail := v_n || ' rows'; return next;

  return query select e.step, e.detail from pc_enforce_capacity() e;
end;
$$;

-- 실제 데이터 기준 용량 현황 (파티션별 포함)
create or replace function pc_db_usage()
returns table (
  object_name  text,
  heap_bytes   bigint,
  index_bytes  bigint,
  total_bytes  bigint,
  total_size   text,
  live_rows    bigint,
  bytes_per_row numeric
)
language sql
stable
set search_path = public
as $$
  select c.relname::text,
         pg_relation_size(c.oid),
         pg_indexes_size(c.oid),
         pg_total_relation_size(c.oid),
         pg_size_pretty(pg_total_relation_size(c.oid)),
         s.n_live_tup,
         round(pg_total_relation_size(c.oid)::numeric / nullif(s.n_live_tup, 0), 1)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'pc\_%'
  union all
  select '(database total)', null, null,
         pg_database_size(current_database()),
         pg_size_pretty(pg_database_size(current_database())),
         null, null
  order by 4 desc
$$;

-- ---------------------------------------------------------------------
-- 12. 용량 테스트: 임시 테이블에 샘플 행을 넣고 실제 행·인덱스 크기를 측정 후 투영
--   실행: select * from pc_capacity_test();
--   * 실제 pc_ 테이블 데이터는 읽지도 변경하지도 않음 (임시 테이블은 종료 시 삭제)
--   * 삽입 순서를 실제 수집 패턴과 같게 구성: 일별=날짜순, 이력=시간순(listing 은 무작위)
--   * 결과는 '샘플 기반 추정'. 실제 운영에서는 갱신/삭제로 인한 bloat 가 추가될 수 있음
--     -> 배포 후 pc_db_usage() 의 실측값으로 재검증
--   * avg_tuple_data_bytes 는 행 데이터만이며, 실제 저장에는 행당 약 24B 헤더 + 4B 포인터가 추가됨
-- ---------------------------------------------------------------------
create or replace function pc_capacity_test(
  p_sample_rows                  integer default 200000,
  p_products                     integer default 10000,
  p_listings_per_product         numeric default 4,
  p_days                         integer default 400,
  p_changes_per_listing_per_year numeric default 52,
  p_day_status_keep_days         integer default 4
)
returns table (
  metric               text,
  sample_rows          bigint,
  heap_bytes           bigint,
  index_bytes          bigint,
  total_bytes          bigint,
  bytes_per_row        numeric,
  avg_tuple_data_bytes numeric,
  projected_rows       bigint,
  projected_mb         numeric
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n         integer := least(greatest(p_sample_rows, 10000), 1000000);
  v_listings  integer := greatest(ceil(p_products * p_listings_per_product)::integer, 1);
  v_sprod     integer := least(greatest(p_products, 1), v_n);
  v_sdays     integer := ceil(v_n::numeric / least(greatest(p_products, 1), v_n))::integer;
  v_keep      integer := greatest(p_day_status_keep_days, 1);
  v_dsl       integer;
  v_cnt       bigint;
  v_w         numeric;
  v_heap      bigint;
  v_idx       bigint;
  v_proj      bigint;
  v_total_mb  numeric := 0;
begin
  drop table if exists pg_temp.t_daily;
  drop table if exists pg_temp.t_changes;
  drop table if exists pg_temp.t_ds;

  -- (a) pc_daily_prices : 날짜순 삽입 (상품 x 날짜)
  create temp table t_daily (like pc_daily_prices including all) on commit drop;
  insert into t_daily (price_date, product_id, low_price, high_price, avg_price, last_low_price,
                       min_listing_id, ok_listings, unavailable_listings, failed_listings,
                       missing_listings, data_status)
  select date '2026-01-01' + d, p,
         500000 + (random() * 1000000)::integer,
         1500000 + (random() * 1000000)::integer,
         1000000 + (random() * 1000000)::integer,
         900000 + (random() * 1000000)::integer,
         1 + (random() * (v_listings - 1))::integer,
         4, 0, 0, 0, 2
  from generate_series(0, v_sdays - 1) d, generate_series(1, v_sprod) p
  order by d, p;

  select count(*), avg(pg_column_size(t.*)) into v_cnt, v_w from t_daily t;
  v_heap := pg_relation_size('pg_temp.t_daily'::regclass);
  v_idx  := pg_indexes_size('pg_temp.t_daily'::regclass);
  v_proj := p_products::bigint * p_days;

  metric := 'pc_daily_prices'; sample_rows := v_cnt; heap_bytes := v_heap; index_bytes := v_idx;
  total_bytes := v_heap + v_idx; bytes_per_row := round((v_heap + v_idx)::numeric / v_cnt, 1);
  avg_tuple_data_bytes := round(v_w, 1); projected_rows := v_proj;
  projected_mb := round(v_proj * ((v_heap + v_idx)::numeric / v_cnt) / 1048576, 1);
  v_total_mb := v_total_mb + projected_mb;
  return next;

  -- (b) pc_price_changes : 시간순 삽입, listing 은 무작위 (B-tree 분할 패턴 재현)
  create temp table t_changes (
    observed_at timestamptz not null,
    listing_id  integer     not null,
    price       integer     not null,
    prev_price  integer,
    primary key (listing_id, observed_at)
  ) on commit drop;
  insert into t_changes
  select timestamptz '2026-01-01 00:00:00+09' + make_interval(secs => i * (p_days * 86400.0 / v_n)),
         1 + (random() * (v_listings - 1))::integer,
         500000 + (random() * 1000000)::integer,
         500000 + (random() * 1000000)::integer
  from generate_series(1, v_n) i
  order by i;

  select count(*), avg(pg_column_size(t.*)) into v_cnt, v_w from t_changes t;
  v_heap := pg_relation_size('pg_temp.t_changes'::regclass);
  v_idx  := pg_indexes_size('pg_temp.t_changes'::regclass);
  v_proj := round(p_products * p_listings_per_product * p_changes_per_listing_per_year
                  * pc_setting_int('price_changes_retention_days', 400) / 365.0)::bigint;

  metric := 'pc_price_changes'; sample_rows := v_cnt; heap_bytes := v_heap; index_bytes := v_idx;
  total_bytes := v_heap + v_idx; bytes_per_row := round((v_heap + v_idx)::numeric / v_cnt, 1);
  avg_tuple_data_bytes := round(v_w, 1); projected_rows := v_proj;
  projected_mb := round(v_proj * ((v_heap + v_idx)::numeric / v_cnt) / 1048576, 1);
  v_total_mb := v_total_mb + projected_mb;
  return next;

  -- (c) pc_listing_day_status : 최근 며칠분만 유지
  v_dsl := least(v_listings, ceil(v_n::numeric / v_keep)::integer);
  create temp table t_ds (like pc_listing_day_status including all) on commit drop;
  insert into t_ds (status_date, listing_id, low_price, high_price, last_price, ok_n, unavail_n, fail_n)
  select date '2026-01-01' + d, l,
         500000 + (random() * 1000000)::integer,
         1500000 + (random() * 1000000)::integer,
         1000000 + (random() * 1000000)::integer,
         2, 0, 0
  from generate_series(0, v_keep - 1) d, generate_series(1, v_dsl) l
  order by d, l;

  select count(*), avg(pg_column_size(t.*)) into v_cnt, v_w from t_ds t;
  v_heap := pg_relation_size('pg_temp.t_ds'::regclass);
  v_idx  := pg_indexes_size('pg_temp.t_ds'::regclass);
  v_proj := v_listings::bigint * v_keep;

  metric := 'pc_listing_day_status'; sample_rows := v_cnt; heap_bytes := v_heap; index_bytes := v_idx;
  total_bytes := v_heap + v_idx; bytes_per_row := round((v_heap + v_idx)::numeric / v_cnt, 1);
  avg_tuple_data_bytes := round(v_w, 1); projected_rows := v_proj;
  projected_mb := round(v_proj * ((v_heap + v_idx)::numeric / v_cnt) / 1048576, 1);
  v_total_mb := v_total_mb + projected_mb;
  return next;

  metric := '(합계: 위 3개 테이블 투영, MB)'; sample_rows := null; heap_bytes := null; index_bytes := null;
  total_bytes := null; bytes_per_row := null; avg_tuple_data_bytes := null; projected_rows := null;
  projected_mb := v_total_mb;
  return next;

  metric := '(미포함) pc_listings, pc_products, 기존 앱 테이블, Supabase 내부 스키마: pc_db_usage() 로 실측';
  sample_rows := null; heap_bytes := null; index_bytes := null; total_bytes := null;
  bytes_per_row := null; avg_tuple_data_bytes := null; projected_rows := null; projected_mb := null;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. 조회 RPC (기본 비공개: service_role 만 실행. 공개 전환은 파일 하단 주석 참고)
--   * SECURITY DEFINER 이지만 입력은 기존 상품 ID(text) 하나이고, 승인된 소스 데이터만 존재함
--   * 데이터가 없는 날은 행이 없거나 low_price = null (차트에서 선을 끊고, 값을 추정하지 않음)
-- ---------------------------------------------------------------------
create or replace function pc_price_history(p_product_id text, p_months integer default 3)
returns table (
  price_date       date,
  low_price        integer,
  high_price       integer,
  avg_price        integer,
  last_low_price   integer,
  data_status      smallint,
  ok_listings      smallint,
  failed_listings  smallint,
  missing_listings smallint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.price_date, d.low_price, d.high_price, d.avg_price, d.last_low_price,
         d.data_status, d.ok_listings, d.failed_listings, d.missing_listings
  from pc_products p
  join pc_daily_prices d on d.product_id = p.id
  where p.product_id = p_product_id
    and d.price_date >= ((now() at time zone 'Asia/Seoul')::date
                         - make_interval(months => least(greatest(p_months, 1), 12)))::date
  order by d.price_date
$$;

create or replace function pc_price_stats(p_product_id text, p_months integer default 3)
returns table (
  lowest_price      integer,
  lowest_date       date,
  highest_price     integer,
  highest_date      date,
  average_price     integer,
  now_price         integer,
  now_checked_at    timestamptz,
  days_with_data    integer,
  days_partial      integer,
  pct_above_lowest  numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with h as (
    select * from pc_price_history(p_product_id, p_months) where low_price is not null
  ),
  lo as (select h.low_price as v, h.price_date as d from h order by h.low_price asc,  h.price_date desc limit 1),
  hi as (select h.high_price as v, h.price_date as d from h order by h.high_price desc, h.price_date desc limit 1),
  cur as (
    select cp.price, cp.checked_at
    from pc_product_current_price cp
    where cp.product_id = p_product_id
  )
  select lo.v, lo.d, hi.v, hi.d,
         (select round(avg(h.avg_price))::integer from h),
         cur.price, cur.checked_at,
         (select count(*) from h)::integer,
         (select count(*) from h where h.data_status = 1)::integer,
         case when cur.price is not null and lo.v > 0
              then round((cur.price - lo.v) * 100.0 / lo.v, 1) end
  from lo cross join hi left join cur on true
$$;

-- ---------------------------------------------------------------------
-- 14. 보안: RLS, 테이블/뷰/시퀀스/함수 권한 (공개 사용자 접근 전면 차단)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- 테이블(파티션 포함)·뷰: RLS 활성화 + anon/authenticated 권한 회수 + service_role 권한 부여
  for r in
    select c.oid::regclass as rel, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'pc\_%' and c.relkind in ('r', 'p', 'v')
  loop
    if r.relkind in ('r', 'p') then
      execute format('alter table %s enable row level security', r.rel);
    end if;
    execute format('revoke all on %s from anon, authenticated', r.rel);
    execute format('grant all on %s to service_role', r.rel);
  end loop;

  -- 시퀀스 (이 파일이 만든 pc_ 시퀀스만)
  for r in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'pc\_%' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', r.rel);
    execute format('grant all on sequence %s to service_role', r.rel);
  end loop;

  -- 함수: 기본 PUBLIC 실행 권한까지 회수하고 service_role 에만 부여 (수집·관리·조회 함수 모두)
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pc\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- 보안 검증: 하나라도 열려 있으면 예외를 던져 전체 트랜잭션 롤백
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname::text, ', ') into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'pc\_%' and c.relkind in ('r', 'p', 'v', 'm')
    and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
  if v_bad is not null then
    raise exception 'PC SECURITY CHECK FAILED (public table privileges): %', v_bad;
  end if;

  select string_agg(c.relname::text, ', ') into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'pc\_%' and c.relkind in ('r', 'p')
    and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'PC SECURITY CHECK FAILED (RLS disabled): %', v_bad;
  end if;

  select string_agg(p.proname::text, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'pc\_%'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_bad is not null then
    raise exception 'PC SECURITY CHECK FAILED (public function execute): %', v_bad;
  end if;

  select string_agg(p.proname::text, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'pc\_%'
    and (select count(*) from pg_proc q where q.oid = p.oid and q.prosecdef) > 0
    and p.proname not in ('pc_price_history', 'pc_price_stats');
  if v_bad is not null then
    raise exception 'PC SECURITY CHECK FAILED (unexpected SECURITY DEFINER): %', v_bad;
  end if;
end $$;

commit;

-- =====================================================================
-- 실행 후 확인용 쿼리 (읽기 전용)
-- =====================================================================
-- select * from pc_source_policies;                -- 전부 pending / allowed=false 인지
-- select * from pc_capacity_test();                -- 샘플 기반 행 크기 측정 + 투영
-- select * from pc_db_usage();                     -- 실제 용량
-- select tablename, policyname from pg_policies where tablename like 'pc\_%';   -- 0행이어야 함
--
-- 정책 승인 예 (약관·API 검증 완료 후에만):
-- select pc_approve_source('11ST', 'API', '담당자명', 'https://약관-URL', '검증 근거 메모', date '2027-04-18');
--
-- 조회 RPC 를 공개하려면(약관상 재표시 권한 검증 후에만) 아래를 별도 실행.
-- 이 파일을 다시 실행하면 이 권한은 회수됨:
-- grant execute on function pc_price_history(text, integer), pc_price_stats(text, integer) to anon, authenticated;
