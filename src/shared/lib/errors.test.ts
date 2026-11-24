import { authErrorMessage, friendlyErrorMessage, GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, UserFacingError } from "./errors";

describe("friendlyErrorMessage", () => {
  it.each([
    "TypeError: Failed to fetch",
    "Network request failed",
    "Load failed",
    "The request timed out. Check your connection and try again.",
    "Failed to send a request to the Edge Function",
  ])("explains a network problem: %s", (message) => {
    expect(friendlyErrorMessage(new Error(message))).toBe(NETWORK_ERROR_MESSAGE);
  });

  it.each([
    'new row violates row-level security policy for table "connections"',
    "canceling statement due to statement timeout",
    "Cannot read properties of undefined (reading 'id')",
  ])("never shows a technical error: %s", (message) => {
    expect(friendlyErrorMessage(new Error(message))).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("keeps messages written for the user", () => {
    expect(friendlyErrorMessage(new UserFacingError("Message can't be empty"))).toBe("Message can't be empty");
    expect(friendlyErrorMessage(new Error("Too many posts, please wait a minute"))).toBe("Too many posts, please wait a minute");
  });

  it("leaves an already-friendly network message unchanged", () => {
    expect(friendlyErrorMessage(new Error(NETWORK_ERROR_MESSAGE))).toBe(NETWORK_ERROR_MESSAGE);
  });
});

describe("authErrorMessage", () => {
  it("is null without an error", () => expect(authErrorMessage(null)).toBeNull());

  it("explains a wrong password", () => {
    expect(authErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" })).toBe("Incorrect email or password.");
  });

  it("says which password rule failed", () => {
    expect(authErrorMessage({ message: "Password should be at least 8 characters.", code: "weak_password" })).toBe(
      "Password should be at least 8 characters.",
    );
  });

  it("explains a dropped connection", () => {
    expect(authErrorMessage({ message: "{}", name: "AuthRetryableFetchError" })).toBe(NETWORK_ERROR_MESSAGE);
  });

  it("never shows a server error", () => {
    expect(authErrorMessage({ message: "Database error querying schema", code: "unexpected_failure" })).toBe(GENERIC_ERROR_MESSAGE);
  });
});
