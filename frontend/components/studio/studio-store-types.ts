import type { CatalogSlice } from "./slices/catalog"
import type { GenerationSlice } from "./slices/generation"
import type { GallerySlice } from "./slices/gallery"
import type { DownloadsSlice } from "./slices/downloads"
import type { RuntimeSlice } from "./slices/runtime"
import type { RefineSlice } from "./slices/refine"
import type { SettingsSlice } from "./slices/settings"
import type { UiSlice } from "./slices/ui"

export type StudioStore = CatalogSlice &
  GenerationSlice &
  GallerySlice &
  DownloadsSlice &
  RuntimeSlice &
  RefineSlice &
  SettingsSlice &
  UiSlice
