/**
 * Drives the REAL Gemini provider through the real Worker endpoint.
 *
 *   npm run dev:api                          # terminal 1
 *   node apps/api/scripts/smoke-gemini.mjs   # terminal 2
 *
 * Requires apps/api/.dev.vars with AI_ENABLED=true and a GEMINI_API_KEY, and
 * apps/web/.env.local for a Firebase web key to mint an anonymous identity.
 *
 * This script never prints a credential. It reads the Firebase web key to sign in and
 * reports only field names, lengths and the model's own output.
 *
 * §21: record the result — success OR failure — in docs/measurements.md with the date and
 * model. A stubbed response is not evidence of an AI capability.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const API = process.env.API_BASE ?? 'http://127.0.0.1:8787/v1';

const readEnvValue = (relPath, key) => {
  for (const line of readFileSync(join(ROOT, relPath), 'utf8').split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  }
  throw new Error(`${key} not found in ${relPath}`);
};

const post = async (path, body, token, key) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const put = async (path, body, token, key) => {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const uuid = () => crypto.randomUUID();

const cue = (id, order, title, speakerId, pref, min, penalty, fixedStartMin = null) => ({
  id, order, title, speakerId,
  preferredDurationMin: pref, minDurationMin: min, compressionPenalty: penalty,
  bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin,
});

const main = async () => {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Cannot reach the Worker at ${API}. Start it with: npm run dev:api`);
    process.exit(1);
  }

  const webKey = readEnvValue('apps/web/.env.local', 'VITE_FIREBASE_API_KEY');
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${webKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' },
  ).then((r) => r.json());
  if (!signIn.idToken) {
    console.error('Anonymous sign-in failed:', JSON.stringify(signIn.error ?? signIn).slice(0, 200));
    process.exit(1);
  }
  const token = signIn.idToken;
  console.log(`signed in as ${signIn.localId}`);

  const eventId = uuid();
  const created = await put(
    `/events/${eventId}`,
    { name: 'Gemini smoke test', startsAt: '2026-09-19T04:30:00Z', hardEndMin: 60, mode: 'rehearsal', seed: 'blank' },
    token, uuid(),
  );
  if (created.status !== 201) {
    console.error('create failed', created.status, JSON.stringify(created.body).slice(0, 200));
    process.exit(1);
  }

  const draft = await put(
    `/events/${eventId}/draft`,
    {
      expectedRevision: 1,
      config: { name: 'Gemini smoke test', startsAt: '2026-09-19T04:30:00Z', hardEndMin: 60 },
      speakers: [{
        id: 'spk-mehta',
        displayName: 'Dr. Ananya Mehta',
        pronunciationHint: 'uh-NAHN-yuh MEH-tah',
        facts: [
          { id: 'f-mehta-1', text: 'Fictional: heads the Applied Systems Lab at a fictional institute.' },
          { id: 'f-mehta-2', text: 'Fictional: speaking on scheduling under real-world constraints.' },
        ],
      }],
      eventFacts: [{ id: 'f-event-1', text: 'Fictional: a college technology festival inaugural session.' }],
      cues: [
        cue('opening', 0, 'Opening remarks', null, 5, 5, 1),
        cue('keynote', 1, 'Keynote', 'spk-mehta', 20, 20, 1),
        cue('qa', 2, 'Audience Q&A', 'spk-mehta', 10, 4, 3),
        cue('closing', 3, 'Closing and vote of thanks', null, 5, 5, 1),
      ],
    },
    token, uuid(),
  );
  if (draft.status !== 200) {
    console.error('draft failed', draft.status, JSON.stringify(draft.body).slice(0, 300));
    process.exit(1);
  }

  const published = await post(`/events/${eventId}/publish`, { expectedRevision: 2 }, token, uuid());
  if (published.status !== 200) {
    console.error('publish failed', published.status, JSON.stringify(published.body).slice(0, 200));
    process.exit(1);
  }
  let revision = published.body.revision;

  const plan = [
    ['opening', null, 'en'],
    ['introduction', 'keynote', 'en'],
    ['transition', 'qa', 'en'],
    ['closing', null, 'en'],
  ];

  const results = [];
  for (const [kind, cueId, language] of plan) {
    const res = await post(
      `/events/${eventId}/script-proposals`,
      { expectedRevision: revision, kind, cueId, language },
      token, uuid(),
    );
    const b = res.body ?? {};
    results.push({
      kind, language, status: res.status,
      source: b.source ?? null, model: b.model ?? null,
      fallbackReason: b.fallbackReason ?? null,
      usedFactIds: b.usedFactIds ?? [],
      warnings: b.warnings ?? [],
      body: b.body ?? '',
      proposalId: b.proposalId ?? null,
    });
    // Approve the first one so the round trip is proven end to end.
    if (res.status === 201 && kind === 'opening') {
      const approved = await post(
        `/events/${eventId}/script-proposals/${b.proposalId}/approve`,
        { expectedRevision: revision, body: b.body, usedFactIds: b.usedFactIds },
        token, uuid(),
      );
      if (approved.status === 200) revision = approved.body.revision;
      results[results.length - 1].approved = approved.status === 200;
    }
  }

  console.log('\n================ RESULTS ================');
  console.log(`date        : ${new Date().toISOString()}`);
  console.log(`event       : ${eventId}`);
  for (const r of results) {
    console.log(`\n--- ${r.kind} (${r.language}) ---`);
    console.log(`  status        : ${r.status}`);
    console.log(`  source        : ${r.source}`);
    console.log(`  model         : ${r.model ?? '(template)'}`);
    if (r.fallbackReason) console.log(`  fallbackReason: ${r.fallbackReason}`);
    console.log(`  schemaValid   : ${r.status === 201}`);
    console.log(`  usedFactIds   : ${JSON.stringify(r.usedFactIds)}`);
    if (r.warnings.length) console.log(`  warnings      : ${JSON.stringify(r.warnings)}`);
    if (r.approved !== undefined) console.log(`  approved      : ${r.approved}`);
    console.log(`  body          : ${r.body}`);
  }
  const real = results.filter((r) => r.source === 'gemini').length;
  console.log(`\n${real} of ${results.length} drafts came from the model; ${results.length - real} fell back to a template.`);
};

await main();
