/**
 * Public client configuration. Every value here ships in the browser bundle by design.
 *
 * The Firebase web API key is public client config, not a server secret. `GEMINI_API_KEY` is
 * a Worker secret and must never be referenced from this package.
 */

export const missingConfig: string[] = [];
const required = (name: string, value: string | undefined): string => {
  if (!value || value.startsWith("your-")) missingConfig.push(name);
  return value ?? "";
};

export const config = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  firebase: {
    apiKey: required(
      "VITE_FIREBASE_API_KEY",
      import.meta.env.VITE_FIREBASE_API_KEY,
    ),
    authDomain: required(
      "VITE_FIREBASE_AUTH_DOMAIN",
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    ),
    projectId: required(
      "VITE_FIREBASE_PROJECT_ID",
      import.meta.env.VITE_FIREBASE_PROJECT_ID,
    ),
    appId: required(
      "VITE_FIREBASE_APP_ID",
      import.meta.env.VITE_FIREBASE_APP_ID,
    ),
  },
} as const;
