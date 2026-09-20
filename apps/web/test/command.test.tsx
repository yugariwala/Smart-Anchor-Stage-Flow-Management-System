import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/auth", () => ({ idToken: vi.fn() }));
import { ApiCallError } from "../src/lib/api";
import { useCommand } from "../src/lib/useCommand";

afterEach(cleanup);
describe("confirmed and unknown command outcomes", () => {
  it("replays the original request body and key after a lost response", async () => {
    const { result } = renderHook(useCommand);
    const received: string[] = [];
    const originalBody = { expectedRevision: 4, name: "Original" };
    const action = vi.fn(async (key: string) => {
      received.push(key);
      if (received.length === 1)
        throw new ApiCallError(0, null, "transport failed");
      return originalBody;
    });
    await act(async () => {
      await result.current.run("save", action);
    });
    expect(result.current.status).toBe("unknown");
    const changed = vi.fn();
    await act(async () => {
      await result.current.run("different-content", changed);
    });
    expect(changed).not.toHaveBeenCalled();
    let replay;
    await act(async () => {
      replay = await result.current.retry();
    });
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(received[1]);
    expect(replay).toEqual(originalBody);
    expect(result.current.status).toBe("ok");
  });
  it("does not send a double click concurrently", async () => {
    const { result } = renderHook(useCommand);
    let resolve!: (value: boolean) => void;
    const action = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run("publish", action);
    });
    await act(async () => {
      await result.current.run("publish", action);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(true);
      await pending;
    });
    expect(result.current.status).toBe("ok");
  });
  it("clears a definitively rejected request so fresh content can be submitted", async () => {
    const { result } = renderHook(useCommand);
    await act(async () => {
      await result.current.run("publish", async () => {
        throw new ApiCallError(
          409,
          {
            error: {
              code: "REVISION_CONFLICT",
              message: "Conflict",
              retryable: false,
              currentRevision: 8,
            },
          },
          "",
        );
      });
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.message).toContain("version 8");
    await act(async () => {
      await result.current.run("updated", async () => true);
    });
    expect(result.current.status).toBe("ok");
  });
});
