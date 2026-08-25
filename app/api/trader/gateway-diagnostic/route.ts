import { createPrivateKey, createPublicKey, randomBytes, sign as signMessage } from "node:crypto";
import { NextResponse } from "next/server";
import { traderAdmin } from "../../../../lib/trader/server";

export const dynamic = "force-dynamic";

const EXPECTED_X = "_x13leNz65fns4Cnoh6vEyAbR8MBxctNegKl_b1_1PY";
const EXPECTED_Y = "HNRDSdxE9FLkV0pD8AVh6Wg6IqAlfIZSew6buiTq-tc";

async function probe(url: string, raw: string, timestamp: number, nonce: string, signature: string) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ln-timestamp": String(timestamp),
        "x-ln-nonce": nonce,
        "x-ln-signature": signature,
      },
      body: raw,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    return { status: response.status, body: body.slice(0, 800) };
  } catch (error) {
    return { status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET() {
  try {
    const admin = traderAdmin();
    const { data, error } = await admin.rpc("trader_gateway_read_signing_private_key");
    if (error || !data) throw new Error("signing_key_unavailable");

    const privateKey = createPrivateKey(String(data));
    const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });
    const keyMatch = publicJwk.x === EXPECTED_X && publicJwk.y === EXPECTED_Y;

    const raw = JSON.stringify({
      requestId: `diag-${Date.now()}`,
      method: "GET",
      path: "/api/v3/time",
      query: "",
    });
    const timestamp = Date.now();
    const nonce = randomBytes(24).toString("hex");
    const message = `${timestamp}\n${nonce}\n${raw}`;
    const signatureBytes = signMessage("sha256", Buffer.from(message, "utf8"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    const signature = signatureBytes.toString("base64");

    // Use independent nonces/signatures because the gateway correctly blocks replay.
    const proxy = await probe("https://trader-gateway.labnarrative.com/relay", raw, timestamp, nonce, signature);

    const directTimestamp = Date.now();
    const directNonce = randomBytes(24).toString("hex");
    const directMessage = `${directTimestamp}\n${directNonce}\n${raw}`;
    const directSignature = signMessage("sha256", Buffer.from(directMessage, "utf8"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64");
    const direct = await probe("http://84.13.156.194:8080/relay", raw, directTimestamp, directNonce, directSignature);

    return NextResponse.json({
      ok: true,
      keyMatch,
      signatureBytes: signatureBytes.length,
      proxy,
      direct,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "diagnostic_failed",
    }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
