/** Hugging Face gated model repo page (license acceptance). */
export type GatedModelRepo = {
  /** Repo id, e.g. `black-forest-labs/FLUX.1-dev`. */
  id: string
  /** Model page URL where the user accepts the license. */
  pageUrl: string
}

/** Extract `org/repo` page URL from an HF resolve/blob URL. */
export function hfRepoFromModelUrl(url: string): GatedModelRepo | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    if (host !== "huggingface.co" && host !== "hf.co") return null
    const parts = parsed.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const id = `${parts[0]}/${parts[1]}`
    return { id, pageUrl: `https://huggingface.co/${id}` }
  } catch {
    return null
  }
}
