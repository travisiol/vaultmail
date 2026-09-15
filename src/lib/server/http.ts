import "server-only";
import { NextResponse } from "next/server";
import { verifyRequest } from "../protocol/auth";
import type { Address } from "../protocol/types";
import { signPubOf } from "./store";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** Run a handler and turn thrown HttpErrors (and anything else) into JSON errors. */
export async function handle(fn: () => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("[vaultmail]", err);
    return json({ error: "Something failed on the server." }, 500);
  }
}

export async function readJson<T>(req: Request, raw: string): Promise<T> {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Body is not JSON.");
  }
}

/** The address whose vault signed this request, or a 401. */
export function requireVault(req: Request, body: string): Address {
  const url = new URL(req.url);
  const result = verifyRequest(req.headers, req.method, url.pathname + url.search, body, signPubOf);
  if (!result.ok) throw new HttpError(401, result.reason);
  return result.address;
}
