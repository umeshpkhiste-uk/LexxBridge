import { supabase } from "@/shared/lib/supabase";
import { signOutOtherSessions, updatePassword } from "./api";

jest.mock("@/shared/lib/supabase", () => ({
  supabase: { auth: { signOut: jest.fn(), updateUser: jest.fn() } },
}));
// api.ts only needs onPasswordSignIn from here, and the real module drags in
// expo-secure-store/notifications transitively — mock it out entirely.
jest.mock("@/features/biometric/biometric", () => ({ onPasswordSignIn: jest.fn() }));

const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;

describe("updatePassword", () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockUpdateUser.mockClear();
  });

  it("revokes every other session's refresh token after a successful change", async () => {
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await updatePassword("NewPassw0rd");

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "NewPassw0rd" });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
    expect(result.error).toBeNull();
  });

  it("does not touch other sessions if the password update itself failed", async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: "Password too weak" } });

    const result = await updatePassword("weak");

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.error).toBe("Password too weak");
  });
});

describe("signOutOtherSessions", () => {
  beforeEach(() => mockSignOut.mockClear());

  it("calls signOut scoped to other sessions only", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const result = await signOutOtherSessions();

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
    expect(result.error).toBeNull();
  });

  it("surfaces an error from Supabase", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "Network error" } });

    const result = await signOutOtherSessions();

    expect(result.error).toBe("Network error");
  });
});
