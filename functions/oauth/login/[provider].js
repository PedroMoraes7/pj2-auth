
import { generateRandomString, hashSHA256, generateCodeChallenge } from '../../shared/crypto.js';

export async function onRequestGet(context) {
  const provider = context.params.provider;
  
  if (provider !== "google" && provider !== "github") {
    return new Response("Not found", { status: 404 }); // Recusa provedor inválido[cite: 1]
  }

  const tx = generateRandomString();
  const state = generateRandomString();
  const codeVerifier = generateRandomString();
  const nonce = provider === "google" ? generateRandomString() : null; // Nonce apenas no Google[cite: 1]

  const txHash = await hashSHA256(tx);
  const stateHash = await hashSHA256(state);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const expiresAt = Math.floor(Date.now() / 1000) + 600;

  // Grava transação no D1[cite: 1]
  await context.env.DB.prepare(
    `INSERT INTO oauth_transactions (id_hash, provider, state_hash, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(txHash, provider, stateHash, nonce, codeVerifier, expiresAt).run();

  const clientId = provider === "google" ? context.env.GOOGLE_CLIENT_ID : context.env.GITHUB_CLIENT_ID;
  const redirectUri = `${context.env.PUBLIC_BASE_URL}/oauth/callback/${provider}`;
  
  let authUrl = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256"); // PKCE obrigatório[cite: 1]

  if (provider === "google") {
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("nonce", nonce);
  }

  // Redireciona com o cookie temporário[cite: 1]
  return new Response(null, {
    status: 302,
    headers: {
      "Location": authUrl.toString(),
      "Set-Cookie": `__Host-oauth-tx=${tx}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store"
    }
  });
}
