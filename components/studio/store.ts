"use client"

import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { createCatalogSlice } from "./slices/catalog"
import { createGenerationSlice } from "./slices/generation"
import { createGallerySlice } from "./slices/gallery"
import { createDownloadsSlice } from "./slices/downloads"
import { createRuntimeSlice } from "./slices/runtime"
import { createRefineSlice } from "./slices/refine"
import { createSettingsSlice } from "./slices/settings"
import { createUiSlice } from "./slices/ui"
import type { StudioStore } from "./studio-store-types"

export type { StudioStore } from "./studio-store-types"

export const useStudioStore = create<StudioStore>()((...a) => ({
  ...createCatalogSlice(...a),
  ...createGenerationSlice(...a),
  ...createGallerySlice(...a),
  ...createDownloadsSlice(...a),
  ...createRuntimeSlice(...a),
  ...createRefineSlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
}))

/**
 * Subscribe with shallow equality. Required for selectors that return
 * new arrays/objects each call — otherwise useSyncExternalStore loops.
 */
export function useStudioSelector<T>(selector: (state: StudioStore) => T): T {
  return useStudioStore(useShallow(selector))
}
