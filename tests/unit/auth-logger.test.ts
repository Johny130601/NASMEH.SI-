import { CredentialsSignin } from "@auth/core/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authErrorLogger } from "@/lib/auth-logger";

/** Phase 7 step 7: the TOTP hand-over is silent; wrong passwords and other errors are still logged. */

afterEach(() => { vi.restoreAllMocks(); });

describe("authErrorLogger", () => {
  it("drops the mfa_required hand-over and logs everything else", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    authErrorLogger(Object.assign(new CredentialsSignin(), { code: "mfa_required" }));
    expect(error).not.toHaveBeenCalled();
    authErrorLogger(new CredentialsSignin());
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("[auth][error] CredentialsSignin:"); // the stable type, not the (minified) class name
    authErrorLogger(new Error("boom"));
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1][0])).toContain("boom");
  });
});
