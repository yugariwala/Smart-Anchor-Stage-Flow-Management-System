import { Dialog, Button } from "@radix-ui/themes";
import { Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";
import { Component, useRef, type ReactNode } from "react";

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        C<span>·</span>
      </span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}
export function Loading({
  label = "Loading your workspace",
}: {
  label?: string;
}) {
  return (
    <div className="page" role="status" aria-label={label}>
      <p className="muted">{label}…</p>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-panel" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="page">
      <EmptyState
        title="This view isn’t available"
        description={message}
        action={
          <div className="row">
            {retry && (
              <Button onClick={retry}>
                <ReloadIcon /> Try again
              </Button>
            )}
            <a className="button-link" href="#/">
              Back to events
            </a>
          </div>
        }
      />
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <Dialog.Content
        maxWidth="880px"
        className="modal-content"
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.querySelector<HTMLElement>("main");
          target?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description size="2" mb="5">
          {description}
        </Dialog.Description>
        <button
          type="button"
          className="icon-button modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <Cross2Icon />
        </button>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
export function CommandNotice({
  status,
  message,
  okMessage,
  retry,
}: {
  status: string;
  message: string;
  /** Shown on success, so every screen confirms a mutation the same way. */
  okMessage?: string;
  retry?: () => void;
}) {
  if (!message && status === "ok" && okMessage) {
    return (
      <div className="notice notice-ok" role="status">
        <p>{okMessage}</p>
      </div>
    );
  }
  if (!message) return null;
  return (
    <div
      className={`notice ${status === "unknown" ? "notice-warn" : "notice-bad"}`}
      role="alert"
    >
      <p>{message}</p>
      {status === "unknown" && retry && (
        <button type="button" onClick={retry}>
          Retry original request
        </button>
      )}
    </div>
  );
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <ErrorState
        message="The application could not display this page. Reload to recover your session."
        retry={() => window.location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}
