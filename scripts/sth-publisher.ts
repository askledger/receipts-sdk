#!/usr/bin/env node
// STH publisher. Runs every 5 minutes (cron / systemd timer / k8s
// CronJob). Fetches the current STH from Trillian, archives it to
// immutable object storage with Object-Lock retention 10 years, and
// updates the public served-pointer to the latest STH.
//
// Required env:
//   PL_TRILLIAN_URL   http URL of the Trillian gateway
//   PL_LOG_ID         log identifier
//   PL_STH_ARCHIVE_S3 s3://bucket/prefix
//   PL_STH_PUBLIC_URL https URL where the latest STH is served
//
// Operates idempotently: the same STH is harmless to re-archive (the
// object name is content-addressed).

import { createHash } from "node:crypto";
import { trillianClient } from "../src/transparency-log/trillian-client.js";

function env(k: string, required = true): string {
  const v = process.env[k];
  if (required && !v) throw new Error(`missing env: ${k}`);
  return v ?? "";
}

async function main(): Promise<void> {
  const log = trillianClient({
    baseUrl: env("PL_TRILLIAN_URL"),
    logId: env("PL_LOG_ID"),
    bearerToken: env("PL_TRILLIAN_TOKEN", false) || undefined,
  });

  const sth = await log.sth();
  const sthBytes = Buffer.from(JSON.stringify(sth, Object.keys(sth).sort()), "utf-8");
  const id = createHash("sha256").update(sthBytes).digest("hex");

  const archive = env("PL_STH_ARCHIVE_S3");           // s3://bucket/prefix
  const m = archive.match(/^s3:\/\/([^/]+)\/(.*)$/);
  if (!m) throw new Error("PL_STH_ARCHIVE_S3 must be s3://bucket/prefix");
  const [, bucket, prefix] = m;
  const objectKey = `${prefix.replace(/\/$/, "")}/${sth.tree_size}-${id.slice(0, 16)}.json`;

  await putWithLock(bucket, objectKey, sthBytes);

  await putWithLock(bucket, `${prefix.replace(/\/$/, "")}/latest.json`, sthBytes, { allowOverwrite: true });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    msg: "sth.published",
    tree_size: sth.tree_size,
    object: `s3://${bucket}/${objectKey}`,
    id,
    timestamp_ms: sth.timestamp_ms,
  }));
}

async function putWithLock(bucket: string, key: string, body: Buffer, opts: { allowOverwrite?: boolean } = {}): Promise<void> {
  // Lazy import so the script runs in environments without AWS SDK
  // when only verification is being exercised.
  const { S3Client, PutObjectCommand } = await import(/* @vite-ignore */ "@aws-sdk/client-s3" as string) as {
    S3Client: new (cfg: unknown) => { send: (cmd: unknown) => Promise<unknown> };
    PutObjectCommand: new (cfg: unknown) => unknown;
  };
  const client = new S3Client({});
  const retentionUntil = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "application/json",
    // Object Lock + COMPLIANCE means even the bucket owner cannot delete
    // before the retention date. This is the regulatory artifact.
    ObjectLockMode: opts.allowOverwrite ? undefined : "COMPLIANCE",
    ObjectLockRetainUntilDate: opts.allowOverwrite ? undefined : retentionUntil,
    CacheControl: "no-store",
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ msg: "sth.publisher.failed", error: String((e as Error).message ?? e) }));
  process.exit(1);
});
