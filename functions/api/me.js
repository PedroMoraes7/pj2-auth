import { hashSHA256 } from '../shared/crypto.js';

export async function onRequestGet(context) {
  const cookieHeader = context.request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/__Host-session=([^;]+)/);
  
  if (!match) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  const sessionHash = await hashSHA256(match[1]); // Resolve o resumo do cookie[cite: 1]
  const now = Math.floor(Date.now() / 1000);

 const session = await context.env.DB.prepare(
  `SELECT subject, email, display_name AS displayName FROM sessions WHERE id_hash = ? AND expires_at > ?`
).bind(sessionHash, now).first();

  if (!session) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  return Response.json(session, { headers: { "Cache-Control": "no-store" } }); // Devolve perfil mínimo com no-store[cite: 1]
}
