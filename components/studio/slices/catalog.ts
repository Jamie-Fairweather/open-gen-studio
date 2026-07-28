import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  deleteUserLora as hostDeleteUserLora,
  listBlueprints as hostListBlueprints,
  listLoras as hostListLoras,
  setSetting,
  type Blueprint,
  type BlueprintDetail,
  type LoraPack,
  type UpscaleModelInfo,
} from "@/lib/host"
import { isInstalled } from "@/lib/blueprint-helpers"
import { notifyError } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { studioRefs } from "../studio-refs"
import { applySet, SETTING_SELECTED_BLUEPRINT } from "./helpers"

export type CatalogSlice = {
  blueprints: Blueprint[]
  blueprintsLoaded: boolean
  selectedId: string | null
  detail: BlueprintDetail | null
  loraPacks: LoraPack[]
  upscaleModels: UpscaleModelInfo[]
  usduReady: boolean
  sizesProbing: boolean
  selectBlueprint: (id: string) => void
  refreshBlueprints: () => void
  setBlueprints: Dispatch<SetStateAction<Blueprint[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setLoraPacks: Dispatch<SetStateAction<LoraPack[]>>
  setDetail: Dispatch<SetStateAction<BlueprintDetail | null>>
  setBlueprintsLoaded: Dispatch<SetStateAction<boolean>>
  setUpscaleModels: Dispatch<SetStateAction<UpscaleModelInfo[]>>
  setUsduReady: Dispatch<SetStateAction<boolean>>
  setSizesProbing: Dispatch<SetStateAction<boolean>>
  /** Opens the Creator tab pre-loaded to edit an existing blueprint. */
  openCreatorEdit: (id: string) => void
  listLoras: typeof hostListLoras
  listBlueprints: typeof hostListBlueprints
  deleteUserLora: typeof hostDeleteUserLora
  isInstalled: typeof isInstalled
}

export const createCatalogSlice: StateCreator<
  StudioStore,
  [],
  [],
  CatalogSlice
> = (set, get) => ({
  blueprints: [],
  blueprintsLoaded: false,
  selectedId: null,
  detail: null,
  loraPacks: [],
  upscaleModels: [],
  usduReady: false,
  sizesProbing: false,

  selectBlueprint: (id) => {
    set({ selectedId: id })
    studioRefs.preferredBlueprintId = id
    void setSetting(SETTING_SELECTED_BLUEPRINT, id).catch(() => {})
  },

  refreshBlueprints: () => {
    void hostListBlueprints()
      .then((bps) => set({ blueprints: bps }))
      .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
  },

  setBlueprints: (next) =>
    set((s) => ({ blueprints: applySet(s.blueprints, next) })),

  setSelectedId: (next) =>
    set((s) => ({ selectedId: applySet(s.selectedId, next) })),

  setLoraPacks: (next) =>
    set((s) => {
      const loraPacks = applySet(s.loraPacks, next)
      studioRefs.loraPacks = loraPacks
      return { loraPacks }
    }),

  setDetail: (next) => set((s) => ({ detail: applySet(s.detail, next) })),

  setBlueprintsLoaded: (next) =>
    set((s) => ({ blueprintsLoaded: applySet(s.blueprintsLoaded, next) })),

  setUpscaleModels: (next) =>
    set((s) => ({ upscaleModels: applySet(s.upscaleModels, next) })),

  setUsduReady: (next) =>
    set((s) => ({ usduReady: applySet(s.usduReady, next) })),

  setSizesProbing: (next) =>
    set((s) => ({ sizesProbing: applySet(s.sizesProbing, next) })),

  openCreatorEdit: (id) => {
    get().setEditBlueprintId(id)
    studioRefs.pushPath(`/creator?edit=${id}`)
  },

  listLoras: hostListLoras,
  listBlueprints: hostListBlueprints,
  deleteUserLora: hostDeleteUserLora,
  isInstalled,
})
