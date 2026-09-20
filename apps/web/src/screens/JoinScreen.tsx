import { useEffect, useRef, useState } from "react";
import { joinEvent } from "../lib/api";
import { consumeInviteCode, navigate } from "../lib/route";
import { useCommand } from "../lib/useCommand";
import { CommandNotice, EmptyState } from "../components/UI";
import { useI18n } from "../lib/i18n";
export function JoinScreen({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const command = useCommand();
  const { run } = command;
  const code = useRef<string | null | undefined>(undefined);
  const started = useRef(false);
  const [missing, setMissing] = useState(false);
  const finish = (result: { role: "anchor"; eventId: string } | null) => {
    if (result) navigate(`#/anchor/${result.eventId}`);
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    code.current = consumeInviteCode();
    const secret = code.current;
    if (!secret) {
      setMissing(true);
      return;
    }
    void run("join", (key) => joinEvent(eventId, secret, key)).then(finish);
  }, [eventId, run]);
  return (
    <div className="page">
      <EmptyState
        title={
          missing
            ? t("This invitation is incomplete")
            : command.status === "failed"
              ? t("This invitation could not be accepted")
              : t("Connecting you to the stage")
        }
        description={
          missing
            ? t(
                "The link has no invitation code. Ask your organizer for a new link.",
              )
            : command.status === "pending"
              ? t("Accepting your private invitation…")
              : t(
                  "Invitations are single-use and expire after one hour. Your organizer can create a new invitation.",
                )
        }
        action={
          <a className="button-link" href="#/">
            {t("Back to your events")}
          </a>
        }
      />
      <CommandNotice
        {...command}
        retry={() =>
          void command.retry<{ role: "anchor"; eventId: string }>().then(finish)
        }
      />
    </div>
  );
}
