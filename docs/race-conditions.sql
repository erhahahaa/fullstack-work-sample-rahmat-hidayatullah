-- race-conditions.sql
--
-- Companion to "Question 2: Backend Architecture, JWT Authentication, and
-- High-Concurrency Scaling". Everything below is plain PostgreSQL 14+ and can
-- be run top to bottom in psql:
--
--     psql "$DATABASE_URL" -f docs/race-conditions.sql
--
-- The script drops and recreates the schema `flash_demo`, so it is safe to run
-- more than once against a scratch database. Do not point it at production.
--
-- What this file demonstrates, in order:
--
--   1. Schema for a flash sale: stock, orders, reservations, idempotency keys.
--   2. The naive read-then-write that oversells when two buyers race.
--   3. The atomic conditional UPDATE, which is the recommended default.
--   4. SELECT ... FOR UPDATE, the pessimistic variant.
--   5. A version column, the optimistic variant, including a retry loop.
--   6. Reservation holds with a TTL, plus the sweeper that returns stock.
--   7. Invariants you can assert in CI or a cron job.
--
-- The short version: the recommendation is section 3 (conditional UPDATE) for
-- the stock decrement, wrapped by section 6 (reservation holds) once payment is
-- asynchronous. Sections 4 and 5 are correct too, but they cost more under
-- contention, and section 2 is simply wrong.
--
-- MongoDB and Redis equivalents are at the bottom, commented out, because the
-- same race exists in both and the fix has a different shape.


DROP SCHEMA IF EXISTS flash_demo CASCADE;
CREATE SCHEMA flash_demo;
SET search_path TO flash_demo, public;


-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

CREATE TABLE inventory (
  sku         text PRIMARY KEY,
  -- Units available to sell right now. Reservations already decremented this.
  stock       integer NOT NULL CHECK (stock >= 0),
  -- Only used by the optimistic variant in section 5.
  version     bigint  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              text NOT NULL REFERENCES inventory (sku),
  user_id          uuid NOT NULL,
  qty              integer NOT NULL CHECK (qty > 0),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  -- Client-generated. A retried checkout must not create a second order.
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One order per (user, attempt key). This is the actual idempotency
  -- guarantee, not the SELECT-then-INSERT you may be tempted to write.
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX orders_pending_idx
  ON orders (created_at)
  WHERE status = 'pending';

CREATE TABLE reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              text NOT NULL REFERENCES inventory (sku),
  user_id          uuid NOT NULL,
  qty              integer NOT NULL CHECK (qty > 0),
  status           text NOT NULL DEFAULT 'held'
                   CHECK (status IN ('held', 'confirmed', 'released', 'expired')),
  idempotency_key  text NOT NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- The sweeper only scans live holds. A partial index keeps that scan small
-- even when the table holds months of confirmed and released rows.
CREATE INDEX reservations_expiry_idx
  ON reservations (expires_at)
  WHERE status = 'held';

INSERT INTO inventory (sku, stock)
VALUES ('drop-001', 1), ('drop-002', 100), ('drop-003', 10);

-- Sanity check: one unit on drop-001, so exactly one of N concurrent buyers
-- can win it.
SELECT sku, stock FROM inventory ORDER BY sku;


-- ---------------------------------------------------------------------------
-- 2. The wrong way: read, decide in application code, write
-- ---------------------------------------------------------------------------
--
-- Two sessions, READ COMMITTED, one unit in stock:
--
--   T1  SELECT stock FROM inventory WHERE sku = 'drop-001';   -> 1
--   T2  SELECT stock FROM inventory WHERE sku = 'drop-001';   -> 1
--   T1  UPDATE inventory SET stock = 0 WHERE sku = 'drop-001';  -- 1 row
--   T2  UPDATE inventory SET stock = 0 WHERE sku = 'drop-001';  -- 1 row
--
-- Both buyers see success, both orders are created, one unit is sold twice.
-- This is a lost update, and no amount of application-level locking fixes it
-- unless the lock is shared by every process that writes stock. A transaction
-- does not help either: under READ COMMITTED neither SELECT blocks the other.
--
-- The read is the problem. The check and the write must be one statement, or
-- the row must be locked between them.

-- Left here only to show the shape. Do not run this in production.
-- UPDATE inventory SET stock = 0 WHERE sku = 'drop-001';


-- ---------------------------------------------------------------------------
-- 3. RECOMMENDED: atomic conditional update
-- ---------------------------------------------------------------------------
--
-- The predicate `stock >= qty` is part of the write. PostgreSQL takes a row
-- lock, and if another transaction committed first it re-evaluates the
-- predicate against the new row version before deciding to update (the
-- EvalPlanQual re-check). That detail is why 99 of 100 concurrent buyers get
-- `UPDATE 0` instead of a negative stock count.
--
-- Run this twice in one session: the first call reports 1 row, the second
-- reports 0 rows and the CHECK constraint is never violated.

UPDATE inventory
SET stock = stock - 1,
    updated_at = now()
WHERE sku = 'drop-001'
  AND stock >= 1;

-- Put the demo unit back so section 6 has something to reserve. In real code
-- there is no reset: the decrement and the order insert commit together.
UPDATE inventory SET stock = 1 WHERE sku = 'drop-001';

-- In the application: `rowCount === 0` means sold out. Return 409, do not
-- retry, and do not create the order. If you use a driver that exposes the
-- affected rows differently (Bun's SQL client returns an array, node-postgres
-- exposes `rowCount`), assert on the count, never on "no exception thrown".
--
-- Same statement, with the order insert in one transaction, is the shape I
-- would ship. The stock decrement and the order commit or roll back together.

BEGIN;

WITH claimed AS (
  UPDATE inventory
  SET stock = stock - 1,
      updated_at = now()
  WHERE sku = 'drop-002'
    AND stock >= 1
  RETURNING sku
)
INSERT INTO orders (sku, user_id, qty, status, idempotency_key)
SELECT claimed.sku, gen_random_uuid(), 1, 'pending', 'demo-attempt-1'
FROM claimed
RETURNING id, sku, status;

-- If the CTE returned no row, the INSERT inserts nothing and this SELECT shows
-- zero orders. The transaction is still valid, so the API can commit and
-- answer 409 without a rollback.
SELECT count(*) AS orders_created FROM orders WHERE idempotency_key = 'demo-attempt-1';

ROLLBACK;

-- Note the ORDER of the two writes when an idempotency key is involved. If you
-- insert the order first with ON CONFLICT DO NOTHING and only decrement stock
-- when a row was inserted, a duplicate retry is free. If you decrement first
-- and then discover the conflict, you have to give the unit back. Section 6
-- shows the safe ordering for reservations.


-- ---------------------------------------------------------------------------
-- 4. Pessimistic: SELECT ... FOR UPDATE
-- ---------------------------------------------------------------------------
--
-- Correct, but it costs a second round trip and holds the row lock across
-- whatever the application does between the SELECT and the UPDATE. If that
-- window contains an HTTP call to a payment provider, you have built a global
-- mutex around your slowest dependency.
--
-- Use it when the decision needs data you cannot express in the UPDATE
-- predicate, for example per-user purchase limits or coupon stacking rules.

BEGIN;

SELECT stock
FROM inventory
WHERE sku = 'drop-002'
FOR UPDATE;  -- blocks other writers until COMMIT or ROLLBACK

-- Application checks the value it just read, then:
UPDATE inventory
SET stock = stock - 1,
    updated_at = now()
WHERE sku = 'drop-002';

COMMIT;

-- `FOR UPDATE SKIP LOCKED` is the right tool for a work queue (see the sweeper
-- in section 6), not for a single hot row. Skipping the locked row would make
-- a buyer fail because someone else was mid-purchase, not because the item was
-- gone. That is a worse user experience and a harder bug to explain.


-- ---------------------------------------------------------------------------
-- 5. Optimistic: version column with a retry loop
-- ---------------------------------------------------------------------------
--
-- Read the version, write only if it has not changed. Under low contention
-- this is cheap and needs no locks. Under a flash sale it is a retry storm:
-- with 100 buyers and one unit, roughly 99 of them read version N, fail, and
-- retry. Each retry is another round trip, and the losers burn CPU to learn
-- what the conditional UPDATE would have told them in one statement.
--
-- Useful when writes are spread across many rows (profile edits, catalogue
-- metadata). Not the tool for the last unit.

CREATE OR REPLACE FUNCTION try_decrement_optimistic(p_sku text, p_max_attempts int DEFAULT 5)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock   integer;
  v_version bigint;
  v_updated integer;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;

    SELECT stock, version INTO v_stock, v_version
    FROM inventory WHERE sku = p_sku;

    IF v_stock IS NULL OR v_stock < 1 THEN
      RETURN false;  -- sold out, not a conflict
    END IF;

    UPDATE inventory
    SET stock = stock - 1,
        version = version + 1,
        updated_at = now()
    WHERE sku = p_sku
      AND version = v_version
      AND stock >= 1;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
      RETURN true;
    END IF;

    IF v_attempt >= p_max_attempts THEN
      RETURN false;  -- give up, surface a retryable error upstream
    END IF;

    -- Jittered backoff belongs here in a real client. Sleeping inside a
    -- database function holds a connection, which is worse than retrying in
    -- the application.
  END LOOP;
END;
$$;

SELECT try_decrement_optimistic('drop-002') AS optimistic_ok;


-- ---------------------------------------------------------------------------
-- 6. Reservation holds with a TTL, and the safe ordering
-- ---------------------------------------------------------------------------
--
-- The conditional UPDATE decides the winner in microseconds, but payment can
-- take minutes. Holding a database transaction open for that long is not an
-- option. So: decrement stock at reservation time, write a row with an expiry,
-- and let the payment webhook confirm or the sweeper expire it.
--
-- The trap: insert the reservation first (to detect an idempotent replay),
-- then decrement. If the decrement fails, delete the reservation before
-- returning "sold out", otherwise a sold-out attempt poisons the idempotency
-- key and a later retry silently replays a failed attempt.
--
-- The function returns one row per call:
--   status = 'held'      a new hold was created
--   status = 'replayed'  this (user, key) already had a hold, stock untouched
--   status = 'sold_out'  no stock, nothing was written
-- The reservation_id lets the caller read the current state (confirmed,
-- released, or expired) when the response is a replay.

CREATE OR REPLACE FUNCTION reserve(
  p_sku   text,
  p_user  uuid,
  p_qty   integer,
  p_key   text,
  p_ttl   interval DEFAULT interval '10 minutes'
)
RETURNS TABLE (reservation_id uuid, state text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO reservations (sku, user_id, qty, idempotency_key, expires_at)
  VALUES (p_sku, p_user, p_qty, p_key, now() + p_ttl)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Replay. Return the existing hold without touching stock.
    SELECT r.id INTO v_id
    FROM reservations r
    WHERE r.user_id = p_user AND r.idempotency_key = p_key;

    RETURN QUERY SELECT v_id, 'replayed'::text;
    RETURN;
  END IF;

  UPDATE inventory
  SET stock = stock - p_qty,
      updated_at = now()
  WHERE sku = p_sku
    AND stock >= p_qty;

  IF NOT FOUND THEN
    -- Undo the reservation so the key can be retried once stock exists.
    DELETE FROM reservations WHERE id = v_id;
    RETURN QUERY SELECT NULL::uuid, 'sold_out'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, 'held'::text;
END;
$$;

-- First attempt holds the last unit of drop-001.
SELECT * FROM reserve('drop-001', '11111111-1111-1111-1111-111111111111', 1, 'attempt-a');
-- Second attempt with the same key replays, stock stays at 0.
SELECT * FROM reserve('drop-001', '11111111-1111-1111-1111-111111111111', 1, 'attempt-a');
-- Different user and key, no stock left.
SELECT * FROM reserve('drop-001', '22222222-2222-2222-2222-222222222222', 1, 'attempt-b');

SELECT sku, stock FROM inventory WHERE sku = 'drop-001';  -- 0

-- Confirm path: the payment webhook arrives while the hold is still live.
-- The guard makes a double-confirm a no-op (the second UPDATE reports 0 rows).
UPDATE reservations
SET status = 'confirmed'
WHERE user_id = '11111111-1111-1111-1111-111111111111'
  AND idempotency_key = 'attempt-a'
  AND status = 'held'
  AND expires_at > now();

UPDATE reservations
SET status = 'confirmed'
WHERE user_id = '11111111-1111-1111-1111-111111111111'
  AND idempotency_key = 'attempt-a'
  AND status = 'held'
  AND expires_at > now();

SELECT status FROM reservations
WHERE user_id = '11111111-1111-1111-1111-111111111111'
  AND idempotency_key = 'attempt-a';  -- confirmed

-- A confirmed hold must not be released back into stock. This release is
-- guarded to status = 'held', so it matches zero rows and stock stays at 0.
-- That guard is what stops a late or duplicated failure event from creating
-- inventory out of nothing.
WITH released AS (
  UPDATE reservations
  SET status = 'released'
  WHERE user_id = '11111111-1111-1111-1111-111111111111'
    AND idempotency_key = 'attempt-a'
    AND status = 'held'
  RETURNING sku, qty
)
UPDATE inventory
SET stock = stock + released.qty
FROM released
WHERE inventory.sku = released.sku;

SELECT sku, stock FROM inventory WHERE sku = 'drop-001';  -- still 0

-- Release path for a failed payment, on a SKU with room to show the change.
SELECT * FROM reserve('drop-003', '33333333-3333-3333-3333-333333333333', 3, 'attempt-c');
SELECT sku, stock FROM inventory WHERE sku = 'drop-003';  -- 7

BEGIN;

WITH released AS (
  UPDATE reservations
  SET status = 'released'
  WHERE user_id = '33333333-3333-3333-3333-333333333333'
    AND idempotency_key = 'attempt-c'
    AND status = 'held'
  RETURNING sku, qty
)
UPDATE inventory
SET stock = stock + released.qty,
    updated_at = now()
FROM released
WHERE inventory.sku = released.sku;

-- Running the same release twice changes nothing: the second pass finds no
-- `held` row and therefore does not increment inventory again.
WITH released AS (
  UPDATE reservations
  SET status = 'released'
  WHERE user_id = '33333333-3333-3333-3333-333333333333'
    AND idempotency_key = 'attempt-c'
    AND status = 'held'
  RETURNING sku, qty
)
UPDATE inventory
SET stock = stock + released.qty
FROM released
WHERE inventory.sku = released.sku;

COMMIT;

SELECT sku, stock FROM inventory WHERE sku = 'drop-003';  -- 10 again

-- Plant an already-expired hold so the sweeper has work to do. A negative TTL
-- is the easy way to simulate a payment that never came back.
SELECT * FROM reserve('drop-003', '44444444-4444-4444-4444-444444444444', 2, 'attempt-d', interval '-1 minute');
SELECT sku, stock FROM inventory WHERE sku = 'drop-003';  -- 8

-- The sweeper. Runs every 30 to 60 seconds. `FOR UPDATE SKIP LOCKED` lets
-- several workers run it concurrently without fighting over the same batch.
-- The status update and the stock return happen in one statement, so a crash
-- cannot expire a hold without giving the unit back.
WITH expired AS (
  UPDATE reservations
  SET status = 'expired'
  WHERE id IN (
    SELECT id
    FROM reservations
    WHERE status = 'held'
      AND expires_at < now()
    ORDER BY expires_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  )
  RETURNING sku, qty
)
UPDATE inventory
SET stock = stock + expired.qty,
    updated_at = now()
FROM expired
WHERE inventory.sku = expired.sku;

SELECT sku, stock FROM inventory WHERE sku = 'drop-003';  -- 10

-- Expiring on time matters for revenue, not just for tidiness. A hold that
-- never expires is inventory that can never be sold again, and the failure is
-- silent: stock simply never returns.


-- ---------------------------------------------------------------------------
-- 7. Invariants worth asserting
-- ---------------------------------------------------------------------------
--
-- These should all return zero rows. Wire them into a cron job or a test that
-- runs after the load test, not into the hot path.

-- No negative stock.
SELECT sku, stock FROM inventory WHERE stock < 0;

-- A paid order must not still hold a live reservation. If it does, the
-- confirm transition was missed and the unit stays pinned until the TTL.
-- This is the check that catches a webhook that arrived but did not apply.
SELECT r.id, r.sku, r.expires_at
FROM reservations r
JOIN orders o
  ON o.user_id = r.user_id
 AND o.idempotency_key = r.idempotency_key
WHERE o.status = 'paid'
  AND r.status = 'held';

-- Every paid order has a confirmed reservation (the join is application
-- specific, shown here as the shape of the check).
SELECT o.id
FROM orders o
LEFT JOIN reservations r
  ON r.user_id = o.user_id
 AND r.idempotency_key = o.idempotency_key
WHERE o.status = 'paid'
  AND (r.id IS NULL OR r.status <> 'confirmed');

-- Stale holds older than the sweeper interval, which means the sweeper is not
-- running. Alert on this before customers notice.
SELECT count(*) AS stale_holds
FROM reservations
WHERE status = 'held'
  AND expires_at < now() - interval '5 minutes';

-- Teardown, commented out so the demo data stays inspectable:
-- DROP SCHEMA flash_demo CASCADE;


-- ---------------------------------------------------------------------------
-- Appendix: the same race in MongoDB and Redis (comments only)
-- ---------------------------------------------------------------------------
--
-- MongoDB
-- -------
-- The atomic single-document form. The filter carries the predicate, so the
-- check and the decrement happen server side in one operation:
--
--   db.inventory.findOneAndUpdate(
--     { sku: "drop-001", stock: { $gte: 1 } },
--     { $inc: { stock: -1 }, $set: { updatedAt: new Date() } },
--     { returnDocument: "after" }
--   )
--
-- A null result means sold out. Do not read the document first and write it
-- back, that is the same lost update as section 2.
--
-- Multi-document atomicity (stock plus order) needs a session and a
-- transaction, which requires a replica set. Without one, keep the order
-- insert idempotent with a unique index on { userId: 1, idempotencyKey: 1 }
-- and reconcile.
--
-- Reservations in Mongo: a TTL index on `expiresAt` deletes documents, it does
-- not give stock back. The delete is not a hook. Run a sweeper that finds
-- expired holds, returns stock with $inc, and marks them expired, exactly like
-- section 6. A TTL index can still be useful to garbage collect the rows a day
-- later, but it must not be the mechanism that restores inventory.
--
-- Redis
-- -----
-- DECR alone is not safe: it will happily go to -1 if you call it when stock
-- is 0. Use a Lua script so the check and the decrement are one atomic step:
--
--   -- KEYS[1] = stock:drop-001, ARGV[1] = qty
--   local stock = tonumber(redis.call("GET", KEYS[1]) or "0")
--   local qty   = tonumber(ARGV[1])
--   if stock < qty then
--     return -1
--   end
--   redis.call("DECRBY", KEYS[1], qty)
--   return stock - qty
--
-- Redis is an admission gate, not the ledger. It is fast and it absorbs the
-- spike, but it is not durable enough to be the only record of who bought
-- what. Treat a Redis reservation as a lease: write the order to Postgres,
-- and if that write fails, compensate with INCRBY. On restart, rebuild the
-- counter from Postgres (`stock_initial - count(paid + held)`) and expect
-- drift for a few seconds.
--
-- In Redis Cluster, keys for one SKU must share a hash tag (`stock:{drop-001}`)
-- or a multi-key script will fail with CROSSSLOT.
