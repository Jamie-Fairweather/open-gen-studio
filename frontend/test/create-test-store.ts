import { create } from "zustand"
import { createCatalogSlice } from "@/components/studio/slices/catalog"
import { createDownloadsSlice } from "@/components/studio/slices/downloads"
import { createGallerySlice } from "@/components/studio/slices/gallery"
import { createGenerationSlice } from "@/components/studio/slices/generation"
import { createRefineSlice } from "@/components/studio/slices/refine"
import { createRuntimeSlice } from "@/components/studio/slices/runtime"
import { createSettingsSlice } from "@/components/studio/slices/settings"
import { createToolsSlice } from "@/components/studio/slices/tools"
import { createUiSlice } from "@/components/studio/slices/ui"
import type { StudioStore } from "@/components/studio/studio-store-types"

/** Isolated store (no session-persist bind) for slice/listener unit tests. */
export function createTestStudioStore() {
  return create<StudioStore>()((...a) => ({
    ...createCatalogSlice(...a),
    ...createGenerationSlice(...a),
    ...createGallerySlice(...a),
    ...createDownloadsSlice(...a),
    ...createRuntimeSlice(...a),
    ...createRefineSlice(...a),
    ...createSettingsSlice(...a),
    ...createToolsSlice(...a),
    ...createUiSlice(...a),
  }))
}
