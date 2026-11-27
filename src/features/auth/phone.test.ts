import { onPasswordSignIn } from "@/features/biometric/biometric";
import { supabase } from "@/shared/lib/supabase";
import { sendLoginCode, toE164, verifyLoginCode, verifyPhoneNumber } from "./phone";

jest.mock("@/shared/lib/supabase", () => ({ supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn(), updateUser: jest.fn() } } }));
jest.mock("@/features/biometric/biometric", () => ({ onPasswordSignIn: jest.fn() }));

const signInWithOtp = supabase.auth.signInWithOtp as jest.Mock;
const verifyOtp = supabase.auth.verifyOtp as jest.Mock;
const PHONE = "+919876543210";

beforeEach(() => jest.clearAllMocks());

it("turns any way of writing an Indian mobile number into E.164", () => {
  for (const input of ["9876543210", "09876543210", "+91 98765 43210", "91-98765-43210"]) expect(toE164(input)).toBe(PHONE);
  expect(toE164("12345")).toBeNull();
});

it("never creates an account from a login code", async () => {
  signInWithOtp.mockResolvedValue({ error: null });
  await sendLoginCode(PHONE);
  expect(signInWithOtp).toHaveBeenCalledWith({ phone: PHONE, options: { shouldCreateUser: false } });
});

it("doesn't reveal whether a number is registered", async () => {
  signInWithOtp.mockResolvedValue({ error: { message: "Signups not allowed for otp", code: "otp_disabled" } });
  expect((await sendLoginCode(PHONE)).error).toBeNull();
});

it("still reports a code that couldn't be sent", async () => {
  signInWithOtp.mockResolvedValue({ error: { message: "Error sending sms", code: "sms_send_failed" } });
  expect((await sendLoginCode(PHONE)).error).toMatch(/couldn't be sent/);
});

it("rejects a wrong code without signing in", async () => {
  verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Token has expired or is invalid", code: "otp_expired" } });
  expect((await verifyLoginCode(PHONE, "000000")).error).toMatch(/wrong or has expired/);
  expect(onPasswordSignIn).not.toHaveBeenCalled();
});

it("verifies a new number as a phone change, not a login", async () => {
  verifyOtp.mockResolvedValue({ error: null });
  await verifyPhoneNumber(PHONE, "123456");
  expect(verifyOtp).toHaveBeenCalledWith({ phone: PHONE, token: "123456", type: "phone_change" });
});
