import jwt from "jsonwebtoken";
import { env } from "../config.js";

export interface SessionTokenPayload {
  userId: string;
  organizationId: string;
  role: "owner" | "admin" | "agent";
  sessionId: string;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS, algorithm: "HS256" });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as SessionTokenPayload & jwt.JwtPayload;
}
