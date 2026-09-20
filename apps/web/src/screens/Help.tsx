import { PageHeading } from "../components/UI";
import { useI18n } from "../lib/i18n";
export function Help() {
  const { t } = useI18n();
  return (
    <div className="page prose-page">
      <PageHeading
        title={t("A little preparation. A calmer stage.")}
        description={t("Your guide to operating an event with CuePilot.")}
      />
      <section className="card">
        <h2>{t("From your first cue to your final applause")}</h2>
        <ol className="guide-steps">
          <li>
            <strong>{t("Set up your event")}</strong>
            <p>
              {t(
                "Choose rehearsal for a clock you control, or live for the actual server clock. Add up to 20 cues, speakers, pronunciation hints, and approved facts.",
              )}
            </p>
          </li>
          <li>
            <strong>{t("Protect what matters")}</strong>
            <p>
              {t(
                "Give cues preferred and minimum durations. Set fixed starts, speaker availability, buffers, and a hard finish. Save the draft, then validate and publish from the console.",
              )}
            </p>
          </li>
          <li>
            <strong>{t("Bring your anchor in")}</strong>
            <p>
              {t(
                "Create a single-use invitation and share it privately. Your anchor opens it in a separate browser profile. They receive the published runbook and acknowledge each revision.",
              )}
            </p>
          </li>
          <li>
            <strong>{t("Respond to a delay")}</strong>
            <p>
              {t(
                "Start cues in order. Report extra minutes or a later speaker release time. Preview the recovery, review the rule checks, and approve. An impossible plan stays unpublished.",
              )}
            </p>
          </li>
          <li>
            <strong>{t("Keep a record")}</strong>
            <p>
              {t(
                "Revision history preserves every published change. Print the anchor runbook as a dated reference. Old revisions are read-only.",
              )}
            </p>
          </li>
        </ol>
      </section>
      <section className="card">
        <h2>{t("What works in this build")}</h2>
        <p>
          {t(
            "Event drafts, deterministic schedule repair, publication, cue controls, rehearsal clocks, invitations, acknowledgments, revision history, deletion, and cached published runbooks are connected to the backend.",
          )}
        </p>
        <p>
          {t(
            "Script generation uses approved facts and requires your review before publication. If AI is unavailable, the backend returns a clearly labelled template. Announcements publish the exact words you enter and can be dismissed in a new revision.",
          )}
        </p>
      </section>
      <section className="card">
        <h2>{t("Your session and event data")}</h2>
        <p>
          {t(
            "Firebase provides an anonymous identity in this browser. There is no password, recovery email, or permanent account. Signing out or clearing browser storage loses access to events this identity owns.",
          )}
        </p>
        <p>
          {t(
            "Events expire after 72 hours. The demo permits two event creations per identity per day plus a shared project cap. Workspace shortcuts are saved only on this browser; they are not an account-wide event list.",
          )}
        </p>
        <p>
          {t(
            "The latest published snapshot is stored locally for read-only network recovery. Offline status always includes a revision and last-sync time. A cold offline page load is not guaranteed. Sign-out and event deletion clear local snapshots.",
          )}
        </p>
      </section>
      <section className="card">
        <h2>{t("Stage operating limits")}</h2>
        <p>
          {t(
            "One stage, fixed cue order, whole-minute scheduling, and an event of up to four hours. Structural agenda edits are draft-only. Acknowledgment means the anchor received a revision; it does not mean the words were spoken.",
          )}
        </p>
        <p>
          {t(
            "Times display in Asia/Kolkata (IST). The interface is available in English, Hindi, and Gujarati; approved script language follows the metadata supplied by the backend.",
          )}
        </p>
      </section>
    </div>
  );
}
