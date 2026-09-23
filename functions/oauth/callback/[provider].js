import { generateRandomString, hashSHA256 } from '../../shared/crypto.js';

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");
  const provider = context.params.provider;

  if (error || !code || !state) return new Response("Invalid request", { status: 400, headers: { "Cache-Control": "no-store" } }); // Recusa erros[cite: 1]

  const cookieHeader = context.request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/__Host-oauth-tx=([^;]+)/);
  if (!match) return new Response("Missing cookie", { status: 400, headers: { "Cache-Control": "no-store" } }); // Exige cookie temporário[cite: 1]
  
  const txCookie = match[1];
  const txHash = await hashSHA256(txCookie);
  const now = Math.floor(Date.now() / 1000);

  const txRecord = await context.env.DB.prepare(`SELECT * FROM oauth_transactions WHERE id_hash = ? AND expires_at > ?`).bind(txHash, now).first();

  if (!txRecord || txRecord.provider !== provider) {
      return new Response("Transaction not found", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const stateHash = await hashSHA256(state);
  await context.env.DB.prepare(`DELETE FROM oauth_transactions WHERE id_hash = ?`).bind(txHash).run(); // Apaga antes de concluir[cite: 1]

  if (txRecord.state_hash !== stateHash) return new Response("Invalid state", { status: 400, headers: { "Cache-Control": "no-store" } });

  // AQUI: Inserir a troca do código de autorização e validação de identidade (Seção 13.5)[cite: 1]
  const subject = "123456"; // Substituir pelo ID validado da API[cite: 1]
  const issuer = provider === "google" ? "https://accounts.google.com" : "https://github.com"; 

  const sessionId = generateRandomString();
  const sessionHash = await hashSHA256(sessionId);
  const sessionExpiresAt = now + 28800; // Sessão de 8 horas[cite: 1]

  await context.env.DB.prepare(
    `INSERT INTO sessions (id_hash, issuer, subject, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(sessionHash, issuer, subject, sessionExpiresAt, now).run(); // Grava sessão[cite: 1]

  const headers = new Headers();
  headers.append("Location", context.env.PUBLIC_BASE_URL);
  headers.append("Set-Cookie", `__Host-oauth-tx=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); // Limpa cookie antigo[cite: 1]
  headers.append("Set-Cookie", `__Host-session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`); // Cria cookie opaco[cite: 1]
  headers.append("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}
