import { hfRepoFromModelUrl, type GatedModelRepo } from "@/lib/hf"

type GatedModel = {
  gated?: boolean
  url?: string | null
}

type BlueprintModels = {
  models?: GatedModel[] | null
}

/** Deduped HF repos from a blueprint's gated models; empty on detail-load failure. */
export async function collectGatedRepos(
  id: string,
  getBlueprint: (id: string) => Promise<BlueprintModels>
): Promise<GatedModelRepo[]> {
  try {
    const detail = await getBlueprint(id)
    const byId = new Map<string, GatedModelRepo>()
    for (const model of detail.models ?? []) {
      if (!model.gated) continue
      const repo = hfRepoFromModelUrl(model.url ?? "")
      if (repo) byId.set(repo.id, repo)
    }
    return [...byId.values()]
  } catch {
    return []
  }
}
