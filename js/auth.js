/** PWA-only session gate (client-side). Not shared with any native app. */
const AUTH_KEY = "shaib_pwa_auth_v1";
const USER = "Shaib";
const PASS = "Saber";

export function isLoggedIn() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function login(username, password) {
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "").trim().toLowerCase();
  if (u === USER.toLowerCase() && p === PASS.toLowerCase()) {
    sessionStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}
