import { hashSHA256 } from '../shared/crypto.js';

export async function onRequestPost(context) { // Aceita apenas POST[cite: 1]
  const origin = context.request.headers.get("Origin");
  
  if (origin !== context.env.PUBLIC_BASE_URL) {
    return new Response("Invalid Origin", { status: 403, headers: { "Cache-Control": "no-store" } }); // Confere Origin[cite: 1]
  }

  const cookieHeader = context.request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/__Host-session=([^;]+)/);

  if (match) {
    const sessionHash = await hashSHA256(match[1]);
    await context.env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(sessionHash).run(); // Remove sessão no D1[cite: 1]
  }

  return new Response(null, {
    status: 303,
    headers: {
      "Location": context.env.PUBLIC_BASE_URL,
      "Set-Cookie": `__Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, // Expira o cookie[cite: 1]
      "Cache-Control": "no-store"
    }
  });
}
