/**
 * Setup. Event config, speaker facts and the agenda table.
 *
 * Validation is the DOMAIN's, not a second copy: the draft body is parsed with
 * `draftCueInputSchema` / `draftConfigSchema` before sending, and the messages shown are the
 * ones those schemas produce. The server validates again and is the authority — this is a
 * fast local echo of the same rules, not a replacement for them.
 *
 * It computes no intervals. The server lays the schedule out from minute zero and returns it.
 */

import { draftConfigSchema, draftCueInputSchema } from '@cuepilot/domain';
import { useEffect, useState } from 'react';

import { errorCopy, getEvent, saveDraft, type DraftCueInputBody } from '../lib/api';
import { navigate } from '../lib/route';
import { useCommand } from '../lib/useCommand';
import { RehearsalBanner } from '../components/RehearsalBanner';

type SpeakerRow = { id: string; displayName: string; pronunciationHint: string; factText: string };

/** The §5 fixture agenda, as draft input. Zero buffers keep the arithmetic visible. */
const FIXTURE_CUES: DraftCueInputBody[] = [
  { id: 'opening', order: 0, title: 'Opening remarks', speakerId: null, preferredDurationMin: 5, minDurationMin: 5, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'keynote', order: 1, title: 'Keynote', speakerId: 'spk-mehta', preferredDurationMin: 20, minDurationMin: 20, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'qa', order: 2, title: 'Audience Q&A', speakerId: 'spk-mehta', preferredDurationMin: 10, minDurationMin: 4, compressionPenalty: 3, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'community', order: 3, title: 'Community interaction', speakerId: 'spk-rao', preferredDurationMin: 10, minDurationMin: 4, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'sponsor', order: 4, title: 'Sponsor address', speakerId: 'spk-fernandes', preferredDurationMin: 10, minDurationMin: 10, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: 45 },
  { id: 'closing', order: 5, title: 'Closing and vote of thanks', speakerId: null, preferredDurationMin: 5, minDurationMin: 5, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
];

const FIXTURE_SPEAKERS: SpeakerRow[] = [
  { id: 'spk-mehta', displayName: 'Dr. Ananya Mehta', pronunciationHint: 'uh-NAHN-yuh MEH-tah', factText: 'Fictional: heads the Applied Systems Lab at a fictional institute.' },
  { id: 'spk-rao', displayName: 'Vikram Rao', pronunciationHint: 'VIK-ram RAO', factText: 'Fictional: final-year student and TechFest community lead.' },
  { id: 'spk-fernandes', displayName: 'Priya Fernandes', pronunciationHint: 'PREE-yah fer-NAN-dez', factText: 'Fictional: represents the fictional sponsor Northwind Labs.' },
];

const NUMERIC: Array<keyof DraftCueInputBody> = [
  'preferredDurationMin',
  'minDurationMin',
  'compressionPenalty',
  'bufferBeforeMin',
  'notBeforeMin',
  'fixedStartMin',
];

export function SetupScreen({ eventId }: { eventId: string }) {
  const command = useCommand();
  const [revision, setRevision] = useState<number | null>(null);
  const [mode, setMode] = useState<'rehearsal' | 'live'>('rehearsal');
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [hardEndMin, setHardEndMin] = useState('60');
  const [speakers, setSpeakers] = useState<SpeakerRow[]>(FIXTURE_SPEAKERS);
  const [cues, setCues] = useState<DraftCueInputBody[]>(FIXTURE_CUES);
  const [issues, setIssues] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const envelope = await getEvent(eventId);
        if (envelope === null) return;
        setRevision(envelope.state.revision);
        setMode(envelope.state.mode);
        setName(envelope.state.name);
        setStartsAt(envelope.state.startsAt);
        setHardEndMin(String(envelope.state.hardEndMin));
        if (envelope.state.cues.length > 0) {
          setCues(
            envelope.state.cues
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((c) => ({
                id: c.id,
                order: c.order,
                title: c.title,
                speakerId: c.speakerId,
                preferredDurationMin: c.preferredDurationMin,
                minDurationMin: c.minDurationMin,
                compressionPenalty: c.compressionPenalty,
                bufferBeforeMin: c.bufferBeforeMin,
                notBeforeMin: c.notBeforeMin,
                fixedStartMin: c.fixedStartMin,
              })),
          );
        }
        if (envelope.state.speakers.length > 0) {
          setSpeakers(
            envelope.state.speakers.map((s) => ({
              id: s.id,
              displayName: s.displayName,
              pronunciationHint: s.pronunciationHint,
              factText: s.facts[0]?.text ?? '',
            })),
          );
        }
      } catch (cause) {
        setLoadError(errorCopy(cause));
      }
    })();
  }, [eventId]);

  const updateCue = (index: number, patch: Partial<DraftCueInputBody>): void => {
    setCues((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  /** Same schemas the server uses, so the inline message matches the eventual rejection. */
  const validate = (): string[] => {
    const found: string[] = [];
    const configResult = draftConfigSchema.safeParse({
      name,
      startsAt,
      hardEndMin: Number(hardEndMin),
    });
    if (!configResult.success) {
      for (const issue of configResult.error.issues) {
        found.push(`Event ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    cues.forEach((cue, i) => {
      const result = draftCueInputSchema.safeParse(cue);
      if (!result.success) {
        for (const issue of result.error.issues) {
          found.push(`Cue ${i + 1} (${cue.title}) ${issue.path.join('.')}: ${issue.message}`);
        }
      }
    });
    const ids = new Set(speakers.map((s) => s.id));
    for (const cue of cues) {
      if (cue.speakerId !== null && !ids.has(cue.speakerId)) {
        found.push(`Cue "${cue.title}" references an unknown speaker.`);
      }
    }
    if (cues.length === 0) found.push('Publication requires at least one cue.');
    if (cues.length > 20) found.push('At most 20 cues.');
    return found;
  };

  const onSave = async (): Promise<void> => {
    const found = validate();
    setIssues(found);
    if (found.length > 0 || revision === null) return;

    const result = await command.run(`draft:${revision}`, (key) =>
      saveDraft(
        eventId,
        {
          expectedRevision: revision,
          config: { name, startsAt, hardEndMin: Number(hardEndMin) },
          speakers: speakers.map((s) => ({
            id: s.id,
            displayName: s.displayName,
            pronunciationHint: s.pronunciationHint,
            facts:
              s.factText.trim().length === 0
                ? []
                : [{ id: `fact-${s.id}`, text: s.factText.trim() }],
          })),
          eventFacts: [{ id: 'event:name', text: name }],
          cues: cues.map((c, i) => ({ ...c, order: i })),
        },
        key,
      ),
    );
    if (result !== null) navigate(`#/event/${eventId}/console`);
  };

  if (loadError !== '') {
    return (
      <div className="page">
        <h1>Setup</h1>
        <p className="notice notice-bad" role="alert">
          {loadError}
        </p>
        <button type="button" onClick={() => navigate('#/')}>
          Back to start
        </button>
      </div>
    );
  }

  return (
    <div>
      <RehearsalBanner mode={mode} />
      <div className="page">
        <div className="row spread">
          <h1>Setup</h1>
          <button type="button" onClick={() => navigate(`#/event/${eventId}/console`)}>
            Go to console
          </button>
        </div>

        <div className="card">
          <h2>Event</h2>
          <div className="field">
            <label htmlFor="name">Event name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="startsAt">Starts at (UTC, ISO-8601 ending Z)</label>
            <input id="startsAt" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <span className="small muted">
              Scheduling values are whole minutes relative to this instant.
            </span>
          </div>
          <div className="field">
            <label htmlFor="hardEnd">Hard finish (minutes after start)</label>
            <input
              id="hardEnd"
              type="number"
              value={hardEndMin}
              onChange={(e) => setHardEndMin(e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <h2>Speakers and approved facts</h2>
          <p className="small muted">
            Only approved facts reach a generated script. Everything here is fictional.
          </p>
          {speakers.map((speaker, i) => (
            <div key={speaker.id} className="row" style={{ marginBottom: 8 }}>
              <input
                aria-label={`Speaker ${i + 1} name`}
                value={speaker.displayName}
                onChange={(e) =>
                  setSpeakers((c) =>
                    c.map((s, j) => (j === i ? { ...s, displayName: e.target.value } : s)),
                  )
                }
              />
              <input
                aria-label={`Speaker ${i + 1} pronunciation hint`}
                value={speaker.pronunciationHint}
                onChange={(e) =>
                  setSpeakers((c) =>
                    c.map((s, j) => (j === i ? { ...s, pronunciationHint: e.target.value } : s)),
                  )
                }
              />
              <input
                aria-label={`Speaker ${i + 1} approved fact`}
                style={{ flex: 1, minWidth: 260 }}
                value={speaker.factText}
                onChange={(e) =>
                  setSpeakers((c) =>
                    c.map((s, j) => (j === i ? { ...s, factText: e.target.value } : s)),
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Agenda</h2>
          <p className="small muted">
            The server computes the initial intervals from minute zero. Preferred and minimum
            durations, the compression penalty, buffers, release times and fixed starts are the
            explicit rules the scheduler must respect.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Speaker</th>
                <th scope="col" className="num">
                  Pref
                </th>
                <th scope="col" className="num">
                  Min
                </th>
                <th scope="col" className="num">
                  Penalty
                </th>
                <th scope="col" className="num">
                  Buffer
                </th>
                <th scope="col" className="num">
                  Not before
                </th>
                <th scope="col" className="num">
                  Fixed start
                </th>
              </tr>
            </thead>
            <tbody>
              {cues.map((cue, i) => (
                <tr key={cue.id}>
                  <td>
                    <input
                      aria-label={`Cue ${i + 1} title`}
                      value={cue.title}
                      onChange={(e) => updateCue(i, { title: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Cue ${i + 1} speaker`}
                      value={cue.speakerId ?? ''}
                      onChange={(e) =>
                        updateCue(i, { speakerId: e.target.value === '' ? null : e.target.value })
                      }
                    >
                      <option value="">none</option>
                      {speakers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                  </td>
                  {NUMERIC.map((field) => {
                    const nullable = field === 'notBeforeMin' || field === 'fixedStartMin';
                    const value = cue[field];
                    return (
                      <td key={field} className="num">
                        <input
                          aria-label={`Cue ${i + 1} ${field}`}
                          type="number"
                          style={{ width: 84 }}
                          value={value === null ? '' : String(value)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '' && nullable) {
                              updateCue(i, { [field]: null } as Partial<DraftCueInputBody>);
                              return;
                            }
                            const n = Number(raw);
                            if (Number.isNaN(n)) return;
                            updateCue(i, { [field]: n } as Partial<DraftCueInputBody>);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {issues.length === 0 ? null : (
          <div className="notice notice-bad" role="alert">
            <strong>Fix these before saving:</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {command.message === '' ? null : (
          <p className="notice notice-bad" role="alert">
            {command.message}
          </p>
        )}

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => void onSave()}
            disabled={command.status === 'pending' || revision === null}
          >
            {command.status === 'pending' ? 'Saving…' : 'Save agenda'}
          </button>
          <span className="small muted">
            Saving creates a new draft revision. Publishing happens on the console.
          </span>
        </div>
      </div>
    </div>
  );
}
