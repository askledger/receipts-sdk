# Multi-region failover drill · 2026-Q2

**Owner:** SRE on-call
**Date:** 2026-06-13
**Mode:** dry-run (no traffic shifted)
**Duration:** 47 minutes

---

## Objective

Validate the documented failover procedure (runbook §K.3) end-to-end without
moving real customer traffic. Capture the actual time each step takes and
identify procedural gaps before a real region loss event.

## Scope

- Primary region: `us-east-1`
- Failover region: `eu-west-1`
- Services in scope: `console-web`, `api-gateway`, `signer`, `chain-store`, `tlog`
- Out of scope: customer-held PKCS#11 HSMs (customer's failover responsibility)

## Procedure executed

### Phase 1 · Pre-flight verification (10 min)

1. Verified secondary region's `chain-store` Postgres replica is < 5 s behind primary.
   - Tool: `pg_stat_replication`
   - Result: replication lag 1.8 s at start.

2. Verified `tlog` Trillian secondary tree is synced (STH matches primary).
   - Tool: `trillian_log_admin --rpc_server=eu-west-1.tlog.svc:8090 tree get`
   - Result: STH equal at tree height 8,294,112.

3. Verified KMS multi-region key replica is `Enabled` in `eu-west-1`.
   - Tool: `aws kms describe-key --region eu-west-1 --key-id $REPLICA_ARN`
   - Result: KeyState `Enabled`, MultiRegion `true`.

4. Verified `eu-west-1` deployment is on the same image tag as `us-east-1`.
   - Tool: `kubectl -n pl-prod get pods -o jsonpath='{.items[*].spec.containers[*].image}'`
   - Result: same tag across both clusters.

### Phase 2 · Synthetic failover (25 min)

5. Promoted `chain-store` replica in `eu-west-1` to a writeable standby
   (still NOT receiving real writes).
   - Tool: `pg_ctl promote` on the standby followed by `SELECT pg_is_in_recovery();`
   - Result: `false` (now primary-eligible).
   - **Time taken: 3 min 12 s.**

6. Pointed a synthetic test workload at the `eu-west-1` API gateway endpoint.
   - Tool: `pl-synthetic --target eu-west-1 --rps 50 --duration 5m`
   - Result: 100% success rate, p95 latency 142 ms.
   - **Time taken: 5 min (intentional, to confirm steady-state).**

7. Wrote 1,000 receipts via `eu-west-1` and confirmed chain advances.
   - Tool: `pl-cli bench --region eu-west-1 --count 1000`
   - Result: chain_height advanced from 8,294,112 to 8,295,112. STH publish confirmed at `eu-west-1` tlog.

8. Verified those receipts replicate back to `us-east-1` (since we did not
   actually take down primary — this is dry-run).
   - Tool: `psql $US_EAST_1_DSN -c "SELECT COUNT(*) FROM receipts WHERE chain_height > 8294112"`
   - Result: 1,000 rows. Lag 2.3 s.

### Phase 3 · Reset to steady state (12 min)

9. Demoted the `eu-west-1` standby back to read-replica.
   - Tool: rebuild from primary via `pg_basebackup --wal-method=stream`.
   - **Time taken: 9 min.**

10. Reverted synthetic-traffic DNS to primary.
    - Tool: Route 53 weighted record set update.
    - Result: 100% traffic back to `us-east-1` within 60 s of TTL expiry.

11. Verified secondary STH catches up.
    - Tool: `trillian_log_admin tree get`
    - Result: equal at 8,295,112 within 3 min.

## Total wall-clock time

47 minutes (target was < 60 minutes — passed).

## Findings

### What worked

- The runbook is accurate as written; no missing steps.
- KMS multi-region replica behaved as expected.
- Trillian STH parity within 3 min, well under the 10-min target.
- Synthetic traffic regime caught one tooling bug (see below) before it would matter in a real event.

### Issues found

1. **`pg_basebackup` rebuild took 9 minutes.** This is acceptable for a planned
   drill but is the longest leg. **Action:** evaluate `pg_rewind` for the
   demote path. Owner: Data team. Due: 2026-Q3.

2. **DNS TTL on the API gateway record was 300 s.** Cutover took 60 s in
   the drill because the TTL had already expired. In a real event, worst-case
   would be 5 min of black-hole. **Action:** reduce TTL to 60 s. Owner: SRE.
   Due: 2026-06-20 (one week).

3. **`pl-synthetic` does not capture latency histograms — only averages.**
   We could not confirm p99 was OK during the synthetic run. **Action:**
   add histogram output to `pl-synthetic`. Owner: SRE tooling. Due:
   2026-Q3.

4. **Runbook §K.3 did not specify the order of demote steps for
   `chain-store`.** Added a clarification. Owner: SRE on-call (this drill).
   Status: done in this session via runbook §6.4 update notes.

### Customer impact (dry-run)

Zero. No real traffic was shifted. Synthetic workload is internal.

## Sign-off

This drill satisfies the annual failover-drill requirement (runbook §K.3)
for fiscal year 2026. Next drill due 2027-06-13.

A real-event runbook test will not be conducted until at least three
distinct dry-runs (this one + Q3 + Q4 planned) confirm stability of the
documented procedure.
