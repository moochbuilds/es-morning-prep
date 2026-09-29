/**
 * On-demand refresh: the page's Refresh button starts the GitHub Actions
 * workflow that fetches data and republishes the site.
 *
 * The site is static, so starting a run needs a GitHub token. The owner pastes
 * a fine-grained token (this repo only, Actions: Read and write) once; it is
 * kept in this browser's localStorage and sent only to api.github.com. Without
 * one, Refresh just reloads the latest published snapshot.
 */

/** "owner/repo", set at build time by the workflow. Unset locally. */
export const REPO = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "";

const TOKEN_KEY = "es-prep:github-token";

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private window): Refresh falls back to reloading.
  }
}

export class TriggerError extends Error {}

/** Queues a run. GitHub answers 204 with no body once it is accepted. */
export async function dispatchRefresh(token: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/deploy.yml/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    });
  } catch {
    throw new TriggerError("Couldn't reach GitHub to start a refresh.");
  }
  if (res.status === 204) return;
  throw new TriggerError(
    [401, 403, 404].includes(res.status)
      ? `GitHub rejected the refresh token (HTTP ${res.status}). It may have expired or lack Actions: write — reconnect it next to Refresh.`
      : `GitHub couldn't start a refresh (HTTP ${res.status}).`,
  );
}
