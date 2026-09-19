/**
 * The persistent §11 header, verbatim:
 *   "REHEARSAL · fictional event and speakers · scenario clock."
 *
 * Mandatory on every screen showing a rehearsal event. In live mode the wording must not
 * claim a rehearsal, so the mode is shown instead of inventing a variant of the label.
 */

export function RehearsalBanner({ mode }: { mode: 'rehearsal' | 'live' }) {
  if (mode === 'rehearsal') {
    return (
      <div className="rehearsal-banner" role="note">
        REHEARSAL {'·'} fictional event and speakers {'·'} scenario clock.
      </div>
    );
  }
  return (
    <div className="rehearsal-banner" role="note">
      LIVE MODE {'·'} actual times come from the server clock.
    </div>
  );
}
