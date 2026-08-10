/** Public legal / product links shown in Settings → About. */

export const APP_LEGAL = {
  name: "Open Gen Studio",
  operator: "Jamie Fairweather",
  licenseName: "Elastic License 2.0",
  licenseUrl: "https://www.elastic.co/licensing/elastic-license",
  githubUrl: "https://github.com/Jamie-Fairweather/open-gen-studio",
  /** Deployed marketing site (must match Partner Center privacy URL). */
  siteOrigin: "https://opengen.studio",
  privacyPath: "/privacy",
  termsPath: "/terms",
} as const

export const APP_LEGAL_PRIVACY_URL = `${APP_LEGAL.siteOrigin}${APP_LEGAL.privacyPath}`
export const APP_LEGAL_TERMS_URL = `${APP_LEGAL.siteOrigin}${APP_LEGAL.termsPath}`

/** Shown when Tauri `getVersion` is unavailable (e.g. browser-only tests). */
export const APP_VERSION_FALLBACK = "0.2.1"
