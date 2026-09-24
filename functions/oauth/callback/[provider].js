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

  // 6. Trocar o código com o code_verifier e o Client Secret[cite: 1]
  const clientId = provider === "google" ? context.env.GOOGLE_CLIENT_ID : context.env.GITHUB_CLIENT_ID;
  const clientSecret = provider === "google" ? context.env.GOOGLE_CLIENT_SECRET : context.env.GITHUB_CLIENT_SECRET;
  const redirectUri = `${context.env.PUBLIC_BASE_URL}/oauth/callback/${provider}`;
  
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token";
  
  const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: txRecord.code_verifier // Usa o verificador salvo no banco[cite: 1]
  });

  const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
      },
      body: tokenParams.toString()
  });

  const tokenData = await tokenResponse.json();
  let subject, issuer, email, displayName;

  // 7. Validar a resposta de identidade conforme o contrato do provedor[cite: 1]
  if (provider === "google") {
      const idToken = tokenData.id_token;
      if (!idToken) return new Response("Missing id_token", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      // 1. Separar as três partes do JWT[cite: 1]
      const parts = idToken.split('.');
      if (parts.length !== 3) return new Response("Invalid JWT format", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      // 2. Decodificar o cabeçalho e exigir alg RS256[cite: 1]
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (header.alg !== "RS256") return new Response("Invalid algorithm", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      // 3 e 4. Obter documento de descoberta e conjunto de chaves JWKS[cite: 1]
      const discoveryRes = await fetch("https://accounts.google.com/.well-known/openid-configuration");
      const discoveryDoc = await discoveryRes.json();
      const jwksRes = await fetch(discoveryDoc.jwks_uri);
      const jwks = await jwksRes.json();
      
      // 5. Selecionar uma chave pública pelo kid[cite: 1]
      const jwk = jwks.keys.find(k => k.kid === header.kid);
      if (!jwk) return new Response("Key not found", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      // 6. Importar a JWK com Web Crypto[cite: 1]
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      
      // 7. Verificar a assinatura com RSASSA-PKCS1-v1_5[cite: 1]
      const encoder = new TextEncoder();
      const data = encoder.encode(parts[0] + "." + parts[1]);
      const signature = new Uint8Array(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
      const isValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
      
      if (!isValid) return new Response("Invalid signature", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      // 8. Validar iss, aud, exp, iat e nonce[cite: 1]
      if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) return new Response("Invalid iss", { status: 400, headers: { "Cache-Control": "no-store" } });
      if (payload.aud !== clientId) return new Response("Invalid aud", { status: 400, headers: { "Cache-Control": "no-store" } });
      if (payload.exp < now) return new Response("Token expired", { status: 400, headers: { "Cache-Control": "no-store" } });
      if (payload.nonce !== txRecord.nonce) return new Response("Invalid nonce", { status: 400, headers: { "Cache-Control": "no-store" } });
      
      subject = payload.sub;
      issuer = payload.iss;
      email = payload.email; // Adicionar esta linha
      displayName = payload.name; // Adicionar esta linha
  } 
  else if (provider === "github") {
      // 9. Exigir access_token e token_type Bearer[cite: 1]
      if (tokenData.token_type?.toLowerCase() !== "bearer" || !tokenData.access_token) {
          return new Response("Invalid token type", { status: 400, headers: { "Cache-Control": "no-store" } });
      }

      // 10. Chamar a API de usuário do GitHub[cite: 1]
      const userRes = await fetch("https://api.github.com/user", {
          headers: {
              "Authorization": `Bearer ${tokenData.access_token}`,
              "Accept": "application/vnd.github+json",
              "X-GitHub-Api-Version": "2026-03-10",
              "User-Agent": "Cloudflare-Pages"
          }
      });
      
      if (userRes.status !== 200) return new Response("GitHub fetch failed", { status: 400, headers: { "Cache-Control": "no-store" } });
      const userData = await userRes.json();
      
      subject = String(userData.id); 
      issuer = "https://github.com";
      email = userData.email || null; // Adicionar esta linha (pode ser nulo como o PDF prevê)
      displayName = userData.name || userData.login; // Adicionar esta linha[cite: 1]

      // 10. Enviar DELETE para revogar a autorização da OAuth App[cite: 1]
      const revokeCredentials = btoa(`${clientId}:${clientSecret}`);
      const revokeRes = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
          method: "DELETE",
          headers: {
              "Authorization": `Basic ${revokeCredentials}`,
              "Accept": "application/vnd.github+json",
              "X-GitHub-Api-Version": "2026-03-10",
              "User-Agent": "Cloudflare-Pages",
              "Content-Type": "application/json"
          },
          body: JSON.stringify({ access_token: tokenData.access_token })
      });

      // Exigir a resposta 204 antes de criar a sessão[cite: 1]
      if (revokeRes.status !== 204) return new Response("Failed to revoke token", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const sessionId = generateRandomString();
  const sessionHash = await hashSHA256(sessionId);
  const sessionExpiresAt = now + 28800; // Sessão de 8 horas[cite: 1]

  await context.env.DB.prepare(
    `INSERT INTO sessions (id_hash, issuer, subject, email, display_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(sessionHash, issuer, subject, email, displayName, sessionExpiresAt, now).run();

  const headers = new Headers();
  headers.append("Location", context.env.PUBLIC_BASE_URL);
  headers.append("Set-Cookie", `__Host-oauth-tx=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); // Limpa cookie antigo[cite: 1]
  headers.append("Set-Cookie", `__Host-session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`); // Cria cookie opaco[cite: 1]
  headers.append("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}
