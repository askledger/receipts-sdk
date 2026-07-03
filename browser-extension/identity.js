/**
 * Corporate identity binding for the browser extension.
 *
 * Lets the company's admin push a config via Chrome managed policies
 * so every receipt the extension signs carries the bound corporate
 * identity (real name, email, department, SSO sub). No anonymous
 * "personal-abc123" — admins see "Maryam Al-Hashimi · Compliance".
 *
 * Modes:
 *   - personal: extension installed by individual, no corporate config.
 *               Receipts carry an opaque local handle. (default)
 *   - corporate-managed: extension installed via Chrome MDM policy.
 *               Corporate config supplies the OIDC issuer, tenant id,
 *               and the user's mapped identity. Receipts carry the
 *               named identity and ship to the corporate ingest URL.
 *
 * Chrome managed-policy schema (deployed via Google Admin / Microsoft
 * Intune / Jamf):
 *
 *   {
 *     "tenant_id": "acme-corp",
 *     "ingest_url": "https://ledger.acme-corp.com/v1/receipts",
 *     "oidc_issuer": "https://login.microsoftonline.com/<tenant>/v2.0",
 *     "user_directory_url": "https://graph.microsoft.com/v1.0/me",
 *     "require_corporate_identity": true,
 *     "block_consumer_endpoints_for_pii": true,
 *     "approved_models": ["claude-sonnet-4-6", "gpt-5", "claude-3-sonnet"]
 *   }
 */

const IDENTITY_STORE = {
  CORPORATE: "pl.identity.corporate",
  PERSONAL: "pl.identity.personal",
  TOKEN: "pl.identity.token",
  TOKEN_EXPIRES: "pl.identity.token_expires",
};

const POLICY_STORE = "pl.managed_policy";

/**
 * Fetch the Chrome managed policy if the extension was deployed by an
 * admin. If absent, the extension stays in personal mode.
 */
export async function loadManagedPolicy() {
  return new Promise((resolve) => {
    if (!chrome.storage?.managed) {
      resolve(null);
      return;
    }
    chrome.storage.managed.get(null, (policy) => {
      if (chrome.runtime.lastError || !policy || Object.keys(policy).length === 0) {
        resolve(null);
        return;
      }
      // Cache the managed policy in local storage for quick reads
      chrome.storage.local.set({ [POLICY_STORE]: policy });
      resolve(policy);
    });
  });
}

/**
 * Trigger OIDC sign-in flow when running under a corporate-managed
 * policy. Uses Chrome's chrome.identity.launchWebAuthFlow under the
 * hood. Returns the user's identity claims.
 */
export async function signInWithCorporateIdentity(policy) {
  if (!policy?.oidc_issuer) {
    throw new Error("Corporate policy missing oidc_issuer");
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = await pkceChallenge(codeVerifier);

  const authUrl =
    `${policy.oidc_issuer}/authorize?` +
    new URLSearchParams({
      response_type: "code",
      client_id: policy.client_id ?? "project-ledger-extension",
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });
  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("OIDC auth flow did not return a code");

  const tokenResponse = await fetch(`${policy.oidc_issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: policy.client_id ?? "project-ledger-extension",
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokens.id_token) throw new Error("OIDC token response missing id_token");

  const claims = decodeJwtClaims(tokens.id_token);

  const identity = {
    mode: "corporate-managed",
    tenant_id: policy.tenant_id,
    sub: claims.sub,
    email: claims.email ?? claims.preferred_username,
    name: claims.name ?? claims.email,
    department: claims.department ?? null,   // populated if IdP supplies it
    roles: claims.roles ?? [],
    oidc_issuer: policy.oidc_issuer,
    bound_at: new Date().toISOString(),
  };

  await chrome.storage.local.set({
    [IDENTITY_STORE.CORPORATE]: identity,
    [IDENTITY_STORE.TOKEN]: tokens.access_token,
    [IDENTITY_STORE.TOKEN_EXPIRES]: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  });

  return identity;
}

/**
 * Get the current bound identity. Returns null when running in
 * personal mode.
 */
export async function getBoundIdentity() {
  const result = await chrome.storage.local.get([
    IDENTITY_STORE.CORPORATE,
    IDENTITY_STORE.PERSONAL,
    POLICY_STORE,
  ]);
  const policy = result[POLICY_STORE];

  if (policy?.require_corporate_identity) {
    return result[IDENTITY_STORE.CORPORATE] ?? null;
  }
  return result[IDENTITY_STORE.CORPORATE] ?? result[IDENTITY_STORE.PERSONAL] ?? null;
}

/**
 * For receipts, derive the event's context block from the bound identity.
 */
export function contextFromIdentity(identity) {
  if (!identity) {
    return { environment: "personal" };
  }
  if (identity.mode === "corporate-managed") {
    return {
      user_id: identity.email ?? identity.sub,
      session_id: identity.sub,
      environment: "production",
      correlation_id: identity.bound_at,
    };
  }
  return { environment: "personal" };
}

/**
 * Sign out and clear all identity state. Useful on device handoff or
 * when an employee leaves the company.
 */
export async function signOut() {
  await chrome.storage.local.remove([
    IDENTITY_STORE.CORPORATE,
    IDENTITY_STORE.TOKEN,
    IDENTITY_STORE.TOKEN_EXPIRES,
  ]);
}

// ---------- helpers ----------

function base64url(buffer) {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

function decodeJwtClaims(jwt) {
  const [, payload] = jwt.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}
