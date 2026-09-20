/**
 * Repeatable production measurements for the release gates in docs/measurements.md.
 *
 * This creates disposable rehearsal events and anonymous Firebase identities. It never
 * prints credentials, invite codes, or generated script bodies.
 *
 *   npm run measure:production
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const API = process.env.API_BASE ?? 'https://cuepilot-api-production.cuepilot-api.workers.dev/v1';
const ONLY = process.env.MEASURE_ONLY ?? null;
const POLL_INTERVAL_MS = 2_000;

if (!API.startsWith('https://')) {
  throw new Error('Production measurement requires an HTTPS API_BASE.');
}
if (ONLY !== null && !['repair', 'publication', 'scripts'].includes(ONLY)) {
  throw new Error('MEASURE_ONLY must be repair, publication, or scripts.');
}

const readEnvValue = (relPath, key) => {
  for (const line of readFileSync(join(ROOT, relPath), 'utf8').split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  }
  throw new Error(`${key} not found in ${relPath}`);
};

const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (method, path, { body, token, idempotencyKey } = {}) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const startedAt = performance.now();
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const elapsedMs = performance.now() - startedAt;
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
  }
  return {
    status: response.status,
    body: parsed,
    elapsedMs,
    serverTiming: response.headers.get('server-timing'),
  };
};

const expectStatus = (result, expected, label) => {
  if (result.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${result.status} ${JSON.stringify(result.body).slice(0, 240)}`);
  }
  return result.body;
};

const signIn = async (webKey) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${webKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"returnSecureToken":true}',
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.idToken) {
    throw new Error(`Anonymous sign-in failed: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  }
  return body.idToken;
};

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};

const summary = (values) => ({
  n: values.length,
  minMs: Math.round(Math.min(...values)),
  p50Ms: Math.round(percentile(values, 0.5)),
  p95Ms: Math.round(percentile(values, 0.95)),
  maxMs: Math.round(Math.max(...values)),
});

const createSeededEvent = async (token, name) => {
  const eventId = uuid();
  const created = await request('PUT', `/events/${eventId}`, {
    token,
    idempotencyKey: uuid(),
    body: {
      name,
      startsAt: '2026-09-19T04:30:00Z',
      hardEndMin: 60,
      mode: 'rehearsal',
      seed: 'college-demo-v1',
    },
  });
  expectStatus(created, 201, 'create seeded event');
  const published = await request('POST', `/events/${eventId}/publish`, {
    token,
    idempotencyKey: uuid(),
    body: { expectedRevision: 1 },
  });
  expectStatus(published, 200, 'publish seeded event');
  return { eventId, revision: published.body.revision };
};

const driveToActiveKeynote = async (token) => {
  const event = await createSeededEvent(token, 'Production measurement');
  const commands = [
    ['POST', `/events/${event.eventId}/cues/opening/start`, { expectedRevision: 2 }],
    ['POST', `/events/${event.eventId}/rehearsal-clock`, { expectedRevision: 3, nowAt: '2026-09-19T04:35:00Z' }],
    ['POST', `/events/${event.eventId}/cues/opening/complete`, { expectedRevision: 4 }],
    ['POST', `/events/${event.eventId}/cues/keynote/start`, { expectedRevision: 5 }],
    ['POST', `/events/${event.eventId}/rehearsal-clock`, { expectedRevision: 6, nowAt: '2026-09-19T04:55:00Z' }],
  ];
  for (const [method, path, body] of commands) {
    const result = await request(method, path, { token, idempotencyKey: uuid(), body });
    expectStatus(result, 200, path);
  }
  return { eventId: event.eventId, revision: 7 };
};

const measureRepairs = async (token, eventId, revision) => {
  const samples = [];
  let serverTimingSamples = 0;
  for (let i = 0; i < 30; i += 1) {
    const result = await request('POST', `/events/${eventId}/repair-proposals`, {
      token,
      idempotencyKey: uuid(),
      body: { expectedRevision: revision, activeForecastEndMin: 37, releaseUpdates: [] },
    });
    const body = expectStatus(result, 201, `repair sample ${i + 1}`);
    if (!body.result?.feasible) throw new Error(`repair sample ${i + 1} was not feasible`);
    samples.push(result.elapsedMs);
    if (result.serverTiming) serverTimingSamples += 1;
  }
  return {
    clientRoundTrip: summary(samples),
    serverTiming: serverTimingSamples === samples.length ? 'reported' : 'not emitted by API',
  };
};

const addAnchor = async (ownerToken, anchorToken, eventId) => {
  const invitation = await request('POST', `/events/${eventId}/invitations`, {
    token: ownerToken,
    idempotencyKey: uuid(),
    body: { role: 'anchor' },
  });
  const invite = expectStatus(invitation, 201, 'create anchor invitation');
  const joined = await request('POST', `/events/${eventId}/join`, {
    token: anchorToken,
    idempotencyKey: uuid(),
    body: { inviteCode: invite.inviteCode },
  });
  expectStatus(joined, 200, 'join as anchor');
};

const measurePublicationFreshness = async (ownerToken, anchorToken, eventId, initialRevision) => {
  await addAnchor(ownerToken, anchorToken, eventId);
  let revision = initialRevision;
  let activeAnnouncementId = null;
  const fromMutationStart = [];
  const fromMutationComplete = [];

  for (let i = 0; i < 20; i += 1) {
    const baseline = await request('GET', `/events/${eventId}/published?afterRevision=${revision}`, {
      token: anchorToken,
    });
    expectStatus(baseline, 204, `publication baseline ${i + 1}`);

    const cycleStartedAt = performance.now();
    const mutationDelayMs = i * 90;
    let mutationStartedAt = 0;
    let mutationCompletedAt = 0;

    const mutation = (async () => {
      await sleep(mutationDelayMs);
      mutationStartedAt = performance.now();
      const result = activeAnnouncementId === null
        ? await request('POST', `/events/${eventId}/announcements`, {
            token: ownerToken,
            idempotencyKey: uuid(),
            body: { expectedRevision: revision, text: `Production visibility sample ${i + 1}`, language: 'en' },
          })
        : await request('POST', `/events/${eventId}/announcements/${activeAnnouncementId}/dismiss`, {
            token: ownerToken,
            idempotencyKey: uuid(),
            body: { expectedRevision: revision },
          });
      mutationCompletedAt = performance.now();
      const body = expectStatus(result, 200, `publication mutation ${i + 1}`);
      revision = body.revision;
      activeAnnouncementId = activeAnnouncementId === null ? body.announcementId : null;
    })();

    const visible = (async () => {
      let tick = 1;
      while (tick <= 3) {
        await sleep(Math.max(0, cycleStartedAt + tick * POLL_INTERVAL_MS - performance.now()));
        const result = await request('GET', `/events/${eventId}/published?afterRevision=${initialRevision + i}`, {
          token: anchorToken,
        });
        if (result.status === 200) return performance.now();
        expectStatus(result, 204, `publication poll ${i + 1}.${tick}`);
        tick += 1;
      }
      throw new Error(`publication sample ${i + 1} was not visible within three polls`);
    })();

    const [, visibleAt] = await Promise.all([mutation, visible]);
    fromMutationStart.push(visibleAt - mutationStartedAt);
    fromMutationComplete.push(visibleAt - mutationCompletedAt);
  }

  return {
    pollingIntervalMs: POLL_INTERVAL_MS,
    sendToVisible: summary(fromMutationStart),
    responseToVisible: summary(fromMutationComplete),
  };
};

const measureScripts = async (token) => {
  const events = [
    await createSeededEvent(token, 'AI measurement A'),
    await createSeededEvent(token, 'AI measurement B'),
  ];
  const plan = [
    ['opening', null],
    ['introduction', 'keynote'],
    ['transition', 'qa'],
    ['closing', null],
  ];
  const languages = ['en', 'hi', 'gu'];
  const samples = [];

  for (let i = 0; i < 20; i += 1) {
    const event = events[Math.floor(i / 10)];
    const [kind, cueId] = plan[i % plan.length];
    const language = languages[i % languages.length];
    const result = await request('POST', `/events/${event.eventId}/script-proposals`, {
      token,
      idempotencyKey: uuid(),
      body: { expectedRevision: event.revision, kind, cueId, language },
    });
    const body = expectStatus(result, 201, `script sample ${i + 1}`);
    samples.push({
      elapsedMs: result.elapsedMs,
      kind,
      language,
      source: body.source,
      model: body.model ?? null,
      fallbackReason: body.fallbackReason ?? null,
    });
  }

  const gemini = samples.filter((sample) => sample.source === 'gemini');
  const fallback = samples.filter((sample) => sample.source !== 'gemini');
  return {
    all: summary(samples.map((sample) => sample.elapsedMs)),
    gemini: gemini.length ? summary(gemini.map((sample) => sample.elapsedMs)) : { n: 0 },
    fallback: fallback.length ? summary(fallback.map((sample) => sample.elapsedMs)) : { n: 0 },
    sources: Object.groupBy(samples, (sample) => sample.source),
    coverage: [...new Set(samples.map((sample) => `${sample.kind}:${sample.language}`))].sort(),
    models: [...new Set(samples.map((sample) => sample.model).filter(Boolean))],
  };
};

const main = async () => {
  const health = await request('GET', '/health');
  expectStatus(health, 200, 'health check');

  const webKey = readEnvValue('apps/web/.env.local', 'VITE_FIREBASE_API_KEY');
  const [ownerToken, anchorToken, aiToken] = await Promise.all([
    signIn(webKey),
    signIn(webKey),
    signIn(webKey),
  ]);

  const report = {
    measuredAt: new Date().toISOString(),
    api: API,
    buildCommit: health.body.buildCommit,
  };

  if (ONLY === null || ONLY === 'repair' || ONLY === 'publication') {
    const event = await driveToActiveKeynote(ownerToken);
    if (ONLY === null || ONLY === 'repair') {
      console.log('Measuring repair latency (30 requests)...');
      report.repair = await measureRepairs(ownerToken, event.eventId, event.revision);
    }
    if (ONLY === null || ONLY === 'publication') {
      console.log('Measuring two-session publication freshness (20 updates)...');
      report.publication = await measurePublicationFreshness(
        ownerToken,
        anchorToken,
        event.eventId,
        event.revision,
      );
    }
  }

  if (ONLY === null || ONLY === 'scripts') {
    console.log('Measuring script response time (20 attempts)...');
    const scripts = await measureScripts(aiToken);
    report.scripts = {
      ...scripts,
      sources: Object.fromEntries(
        Object.entries(scripts.sources).map(([source, entries]) => [source, entries.length]),
      ),
    };
  }

  report.limitations = [
    'The API does not emit Server-Timing, so repair server execution time is not separable from network time.',
    'Worker CPU must be read from Cloudflare telemetry after this traffic sample.',
    'Language faithfulness requires native-speaker review and is not inferred from successful responses.',
  ];
  console.log('\n' + JSON.stringify(report, null, 2));
};

await main();
