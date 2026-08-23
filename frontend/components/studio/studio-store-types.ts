import type { CatalogSlice } from "./slices/catalog"
import type { GenerationSlice } from "./slices/generation"
import type { GallerySlice } from "./slices/gallery"
import type { DownloadsSlice } from "./slices/downloads"
import type { RuntimeSlice } from "./slices/runtime"
import type { RefineSlice } from "./slices/refine"
import type { SettingsSlice } from "./slices/settings"
import type { ToolsSlice } from "./slices/tools"
import type { UiSlice } from "./slices/ui"

/** Full Zustand studio store: catalog, generate, gallery, downloads, settings, tools, UI. */
export type StudioStore = CatalogSlice &
  GenerationSlice &
  GallerySlice &
  DownloadsSlice &
  RuntimeSlice &
  RefineSlice &
  SettingsSlice &
  ToolsSlice &
  UiSlice
