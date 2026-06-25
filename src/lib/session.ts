import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
}

const sessionSecret = process.env.SESSION_SECRET;
const secureCookie =
  process.env.SESSION_COOKIE_SECURE === "false"
    ? false
    : process.env.SESSION_COOKIE_SECURE === "true"
    ? true
    : process.env.NODE_ENV === "production";

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: "video-prompt-session",
  cookieOptions: {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
