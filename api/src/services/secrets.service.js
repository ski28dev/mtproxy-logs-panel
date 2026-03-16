import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { buildClientSecret, generateRawSecret } from '../utils/mtproto.js';
import { badRequest, notFound } from '../utils/errors.js';

const ACTIVE_LOOKBACK_DAYS = 30;

function buildConnectionKey(event) {
  return [
    event.proxy_secret_id ?? 'one',
    event.slot_index ?? 'x',
    event.connection_fd ?? 'x',
    event.client_ip ?? 'x',
    event.remote_port ?? 'x'
  ].join(':');
}

function applyEvent(activeKeys, event) {
  const key = buildConnectionKey(event);
  if (event.event_type === 'handshake_ok') {
    activeKeys.add(key);
    return;
  }
  if (event.event_type === 'disconnect') {
    activeKeys.delete(key);
  }
}

function alignWindowEnd(now, bucketMs) {
  const nowMs = now.getTime();
  return nowMs - (nowMs % bucketMs) + bucketMs;
}

function buildTimeline(events, bucketMs, bucketCount, now = new Date()) {
  const end = alignWindowEnd(now, bucketMs);
  const start = end - bucketMs * bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucketStart: new Date(start + index * bucketMs).toISOString(),
    handshakes: 0,
    uniqueIpSet: new Set(),
    activeConnectionsPeak: 0,
    activeConnectionsEnd: 0
  }));

  const activeKeys = new Set();
  let index = 0;

  while (index < events.length) {
    const eventTime = new Date(events[index].connected_at).getTime();
    if (eventTime >= start) {
      break;
    }
    applyEvent(activeKeys, events[index]);
    index += 1;
  }

  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.bucketStart).getTime();
    const bucketEnd = bucketStart + bucketMs;
    let peak = activeKeys.size;

    while (index < events.length) {
      const event = events[index];
      const eventTime = new Date(event.connected_at).getTime();
      if (eventTime >= bucketEnd) {
        break;
      }

      if (event.event_type === 'handshake_ok') {
        bucket.handshakes += 1;
        bucket.uniqueIpSet.add(event.client_ip);
      }

      applyEvent(activeKeys, event);
      if (activeKeys.size > peak) {
        peak = activeKeys.size;
      }

      index += 1;
    }

    bucket.activeConnectionsPeak = peak;
    bucket.activeConnectionsEnd = activeKeys.size;
  }

  return {
    activeConnectionsNow: activeKeys.size,
    buckets: buckets.map(({ uniqueIpSet, ...bucket }) => ({
      ...bucket,
      uniqueIps: uniqueIpSet.size
    }))
  };
}

async function loadRecentEvents(days = ACTIVE_LOOKBACK_DAYS, secretId = null) {
  const where = secretId ? 'WHERE proxy_secret_id = ? AND connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)' : 'WHERE connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)';
  const params = secretId ? [secretId, days] : [days];
  const [rows] = await pool.query(
    `
      SELECT
        proxy_secret_id,
        event_type,
        slot_index,
        connection_fd,
        client_ip,
        remote_port,
        connected_at
      FROM proxy_secret_events
      ${where}
      ORDER BY connected_at ASC, id ASC
    `,
    params
  );

  return rows;
}

function buildActiveCountsBySecret(events) {
  const states = new Map();

  for (const event of events) {
    let state = states.get(event.proxy_secret_id);
    if (!state) {
      state = { activeKeys: new Set() };
      states.set(event.proxy_secret_id, state);
    }
    applyEvent(state.activeKeys, event);
  }

  return new Map(
    Array.from(states.entries()).map(([secretId, state]) => [secretId, state.activeKeys.size])
  );
}

function countWindowMetrics(events, hours) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  const uniqueIps = new Set();
  let handshakes = 0;

  for (const event of events) {
    if (event.event_type !== 'handshake_ok') {
      continue;
    }
    const eventTime = new Date(event.connected_at).getTime();
    if (eventTime < since) {
      continue;
    }
    handshakes += 1;
    uniqueIps.add(event.client_ip);
  }

  return {
    hours,
    uniqueIps: uniqueIps.size,
    handshakes
  };
}

export async function listSecrets(windowHours) {
  const recentEvents = await loadRecentEvents();
  const activeCounts = buildActiveCountsBySecret(recentEvents);
  const [rows] = await pool.query(
    `
      SELECT
        s.id,
        s.label,
        s.group_name,
        s.note,
        s.status,
        s.raw_secret,
        s.client_secret,
        s.max_unique_ips,
        s.current_slot,
        s.created_at,
        s.updated_at,
        s.revoked_at,
        COUNT(DISTINCT CASE
          WHEN e.event_type = 'handshake_ok'
           AND e.connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR) THEN e.client_ip
        END) AS unique_ips_window,
        SUM(CASE
          WHEN e.event_type = 'handshake_ok'
           AND e.connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR) THEN 1
          ELSE 0
        END) AS handshakes_window,
        MAX(CASE
          WHEN e.event_type = 'handshake_ok' THEN e.connected_at
        END) AS last_seen_at
      FROM proxy_secrets s
      LEFT JOIN proxy_secret_events e ON e.proxy_secret_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `,
    [windowHours, windowHours]
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    groupName: row.group_name,
    note: row.note,
    status: row.status,
    rawSecret: row.raw_secret,
    clientSecret: row.client_secret,
    maxUniqueIps: row.max_unique_ips,
    currentSlot: row.current_slot,
    uniqueIpsWindow: row.unique_ips_window || 0,
    handshakesWindow: row.handshakes_window || 0,
    activeConnectionsNow: activeCounts.get(row.id) || 0,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    proxyLink: `https://t.me/proxy?server=${env.mtproxy.host}&port=${env.mtproxy.port}&secret=${row.client_secret}`
  }));
}

export async function getSecret(secretId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        label,
        group_name,
        note,
        status,
        raw_secret,
        client_secret,
        max_unique_ips,
        current_slot,
        created_at,
        updated_at,
        revoked_at
      FROM proxy_secrets
      WHERE id = ?
      LIMIT 1
    `,
    [secretId]
  );
  return rows[0] || null;
}

export async function createSecret(input) {
  const rawSecret = generateRawSecret();
  const clientSecret = buildClientSecret(rawSecret, env.mtproxy.fakeHost);
  const label = input.label.trim();

  if (!label) {
    throw badRequest('Label is required');
  }

  const note = input.note?.trim() || '';
  const groupName = input.groupName?.trim() || null;
  const maxUniqueIps = Number.isFinite(input.maxUniqueIps) ? input.maxUniqueIps : 10;

  const [result] = await pool.query(
    `
      INSERT INTO proxy_secrets (
        label,
        group_name,
        note,
        status,
        raw_secret,
        client_secret,
        max_unique_ips,
        fake_host,
        port
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `,
    [label, groupName, note, rawSecret, clientSecret, maxUniqueIps, env.mtproxy.fakeHost, env.mtproxy.port]
  );

  return getSecret(result.insertId);
}

export async function revokeSecret(secretId) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS active_count
      FROM proxy_secrets
      WHERE status = 'active'
    `
  );

  if (rows[0].active_count <= 1 && secret.status === 'active') {
    throw badRequest('Cannot revoke the last active secret');
  }

  await pool.query(
    `
      UPDATE proxy_secrets
      SET status = 'revoked', revoked_at = UTC_TIMESTAMP(), current_slot = NULL
      WHERE id = ?
    `,
    [secretId]
  );

  return getSecret(secretId);
}

export async function activateSecret(secretId) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  await pool.query(
    `
      UPDATE proxy_secrets
      SET status = 'active', revoked_at = NULL
      WHERE id = ?
    `,
    [secretId]
  );

  return getSecret(secretId);
}

export async function deleteSecret(secretId) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS active_count
      FROM proxy_secrets
      WHERE status = 'active'
    `
  );

  if (rows[0].active_count <= 1 && secret.status === 'active') {
    throw badRequest('Cannot delete the last active secret');
  }

  await pool.query(
    `
      DELETE FROM proxy_secret_events
      WHERE proxy_secret_id = ?
    `,
    [secretId]
  );

  await pool.query(
    `
      DELETE FROM proxy_secrets
      WHERE id = ?
    `,
    [secretId]
  );

  return secret;
}

export async function rotateSecret(secretId) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const rawSecret = generateRawSecret();
  const clientSecret = buildClientSecret(rawSecret, env.mtproxy.fakeHost);

  await pool.query(
    `
      UPDATE proxy_secrets
      SET
        raw_secret = ?,
        client_secret = ?,
        status = 'active',
        revoked_at = NULL,
        updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `,
    [rawSecret, clientSecret, secretId]
  );

  return getSecret(secretId);
}

export async function updateSecretMeta(secretId, input) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const label = input.label?.trim() || secret.label;
  const note = input.note?.trim() ?? secret.note ?? '';
  const groupName = input.groupName?.trim() || null;
  const maxUniqueIps = Number.isFinite(input.maxUniqueIps) ? input.maxUniqueIps : secret.max_unique_ips;

  if (!label) {
    throw badRequest('Label is required');
  }

  await pool.query(
    `
      UPDATE proxy_secrets
      SET
        label = ?,
        group_name = ?,
        note = ?,
        max_unique_ips = ?,
        updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `,
    [label, groupName, note, maxUniqueIps, secretId]
  );

  return getSecret(secretId);
}

export async function listSecretEvents(secretId, limit = 100) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const [rows] = await pool.query(
    `
      SELECT
        id,
        event_type,
        slot_index,
        connection_fd,
        client_ip,
        remote_port,
        connected_at,
        duration_seconds,
        source_line
      FROM proxy_secret_events
      WHERE proxy_secret_id = ?
      ORDER BY connected_at DESC
      LIMIT ?
    `,
    [secretId, limit]
  );

  return rows;
}

export async function listSecretUniqueIps(secretId, limit = 200) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const [rows] = await pool.query(
    `
      SELECT
        client_ip,
        SUM(CASE WHEN event_type = 'handshake_ok' THEN 1 ELSE 0 END) AS handshakes_count,
        SUM(CASE WHEN event_type = 'disconnect' THEN 1 ELSE 0 END) AS disconnects_count,
        MIN(CASE WHEN event_type = 'handshake_ok' THEN connected_at END) AS first_seen_at,
        MAX(CASE WHEN event_type = 'handshake_ok' THEN connected_at END) AS last_seen_at
      FROM proxy_secret_events
      WHERE proxy_secret_id = ?
        AND client_ip IS NOT NULL
        AND client_ip != ''
      GROUP BY client_ip
      ORDER BY last_seen_at DESC, handshakes_count DESC, client_ip ASC
      LIMIT ?
    `,
    [secretId, limit]
  );

  return rows;
}

export async function getSecretStats(secretId) {
  const secret = await getSecret(secretId);
  if (!secret) {
    throw notFound('Secret not found');
  }

  const [aggregateRows] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN event_type = 'handshake_ok' THEN 1 ELSE 0 END) AS handshakes_total,
        COUNT(DISTINCT CASE WHEN event_type = 'handshake_ok' THEN client_ip END) AS unique_ips_total,
        SUM(CASE WHEN event_type = 'disconnect' THEN 1 ELSE 0 END) AS disconnects_total,
        MAX(CASE WHEN event_type = 'handshake_ok' THEN connected_at END) AS last_seen_at
      FROM proxy_secret_events
      WHERE proxy_secret_id = ?
    `,
    [secretId]
  );

  const recentEvents = await loadRecentEvents(ACTIVE_LOOKBACK_DAYS, secretId);
  const windows = [24, 72, 168].map((hours) => countWindowMetrics(recentEvents, hours));
  const hourly = buildTimeline(recentEvents, 60 * 60 * 1000, 24);
  const daily = buildTimeline(recentEvents, 24 * 60 * 60 * 1000, 14);

  return {
    current: {
      activeConnectionsNow: hourly.activeConnectionsNow
    },
    totals: {
      handshakesTotal: aggregateRows[0]?.handshakes_total || 0,
      uniqueIpsTotal: aggregateRows[0]?.unique_ips_total || 0,
      disconnectsTotal: aggregateRows[0]?.disconnects_total || 0,
      lastSeenAt: aggregateRows[0]?.last_seen_at || null
    },
    windows,
    historyHourly: hourly.buckets,
    historyDaily: daily.buckets
  };
}

export async function getDashboardSummary(windowHours) {
  const [summaryRows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_secrets,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_secrets,
        SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked_secrets
      FROM proxy_secrets
    `
  );

  const [usageRows] = await pool.query(
    `
      SELECT
        COUNT(DISTINCT CASE
          WHEN connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) THEN client_ip
        END) AS unique_ips_24h,
        COUNT(DISTINCT CASE
          WHEN connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 72 HOUR) THEN client_ip
        END) AS unique_ips_72h,
        COUNT(DISTINCT CASE
          WHEN connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR) THEN client_ip
        END) AS unique_ips_window
      FROM proxy_secret_events
      WHERE event_type = 'handshake_ok'
        AND connected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL GREATEST(72, ?) HOUR)
    `,
    [windowHours, windowHours]
  );

  const [metaRows] = await pool.query(
    `
      SELECT meta_key, meta_value, updated_at
      FROM app_meta
      WHERE meta_key IN ('last_mtproxy_sync_at', 'last_log_import_at')
    `
  );

  const meta = Object.fromEntries(
    metaRows.map((row) => [row.meta_key, { value: row.meta_value, updatedAt: row.updated_at }])
  );

  return {
    totals: summaryRows[0],
    uniqueIps24h: usageRows[0]?.unique_ips_24h || 0,
    uniqueIps72h: usageRows[0]?.unique_ips_72h || 0,
    uniqueIpsWindow: usageRows[0]?.unique_ips_window || 0,
    lastMtproxySyncAt: meta.last_mtproxy_sync_at?.updatedAt || null,
    lastLogImportAt: meta.last_log_import_at?.updatedAt || null
  };
}
