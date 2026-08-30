/**
 * MUSE 로그인 시스템 공동활용.
 *
 * MUSE(c1.sysmed.kr:8443)는 c1 리눅스 계정을 PAM으로 검증하고 itsdangerous
 * 서명 쿠키(muse_session)를 심는다. LABIS는 같은 호스트(c1.sysmed.kr)에서
 * 서빙되므로 그 쿠키를 그대로 받는다. 여기서는
 *  1) muse_session 토큰 검증 (itsdangerous URLSafeTimedSerializer 호환 구현)
 *  2) c1 계정+암호 직접 검증 (MUSE와 같은 root 헬퍼 muse-pam-verify)
 *  3) c1 계정명 ↔ LABIS User 매핑(find-or-create)
 * 을 제공한다.
 */
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { prisma } from "./prisma";

export const MUSE_COOKIE = "muse_session";
const SECRET_FILE =
  process.env.MUSE_SESSION_SECRET_FILE || "/data/master/MUSE/data/muse-session-secret";
const SALT = "muse-session";
const TTL_SEC = Number(process.env.MUSE_SESSION_TTL || 12 * 3600);
const VERIFY_HELPER = process.env.MUSE_VERIFY_HELPER || "/usr/local/sbin/muse-pam-verify";

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

let _secret: string | null = null;
function museSecret(): string | null {
  if (_secret) return _secret;
  try {
    _secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
    return _secret && _secret.length >= 32 ? _secret : null;
  } catch {
    return null; // 시크릿을 못 읽으면 SSO 비활성 (로그인 폼은 그대로 동작)
  }
}

/** itsdangerous Signer(django-concat, sha1) 파생 키 */
function derivedKey(secret: string): Buffer {
  return crypto
    .createHash("sha1")
    .update(SALT + "signer" + secret, "utf8")
    .digest();
}

/**
 * muse_session 토큰 검증 → c1 계정명 또는 null.
 * 토큰 형식: payload.timestamp.signature (URL-safe base64, 서명은 HMAC-SHA1)
 * payload가 '.'로 시작하면 zlib 압축본이다.
 */
export function verifyMuseToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const secret = museSecret();
  if (!secret) return null;

  const sigIdx = token.lastIndexOf(".");
  if (sigIdx <= 0) return null;
  const value = token.slice(0, sigIdx); // payload.timestamp — 서명 대상
  const sig = b64urlDecode(token.slice(sigIdx + 1));
  const expected = crypto.createHmac("sha1", derivedKey(secret)).update(value, "utf8").digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;

  const tsIdx = value.lastIndexOf(".");
  if (tsIdx < 0) return null;
  const tsBytes = b64urlDecode(value.slice(tsIdx + 1));
  let ts = 0;
  for (const b of tsBytes) ts = ts * 256 + b;
  if (Date.now() / 1000 - ts > TTL_SEC) return null;

  let payloadPart = value.slice(0, tsIdx);
  try {
    let raw: Buffer;
    if (payloadPart.startsWith(".")) {
      raw = zlib.inflateSync(b64urlDecode(payloadPart.slice(1)));
    } else {
      raw = b64urlDecode(payloadPart);
    }
    const data = JSON.parse(raw.toString("utf8"));
    const user = data?.u;
    return typeof user === "string" && /^[a-z_][a-z0-9_-]*$/i.test(user) ? user : null;
  } catch {
    return null;
  }
}

/** c1 계정+암호 검증 — MUSE와 동일한 root PAM 헬퍼(sudo -n, 암호는 stdin). */
export function verifyC1Password(username: string, password: string): boolean {
  if (!username || !password) return false;
  if (!/^[a-z_][a-z0-9_-]*$/i.test(username)) return false;
  try {
    const proc = spawnSync("sudo", ["-n", VERIFY_HELPER, username], {
      input: password,
      timeout: 10000,
      stdio: ["pipe", "ignore", "ignore"],
    });
    return proc.status === 0;
  } catch {
    return false;
  }
}

/** c1 계정명으로 LABIS 사용자 찾기(없으면 생성). */
export async function findOrCreateC1User(username: string) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  // 과거 마이그레이션 계정(placeholder 이메일)과의 충돌 없이 새로 만든다.
  const email = `${username}@c1.sysmed.kr`.toLowerCase();
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    return prisma.user.update({ where: { id: byEmail.id }, data: { username } });
  }
  return prisma.user.create({
    data: { email, name: username, username },
  });
}
