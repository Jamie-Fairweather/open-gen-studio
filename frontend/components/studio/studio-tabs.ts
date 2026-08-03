import {
  DownloadIcon,
  PenLineIcon,
  SettingsIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"
import type { StudioTab } from "@/lib/host"

export const MEDIA_TABS: { id: StudioTab; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
]

export const UTILITY_TABS: {
  id: StudioTab
  label: string
  icon: LucideIcon
}[] = [
  { id: "tools", label: "Tools", icon: WrenchIcon },
  { id: "creator", label: "Creator", icon: PenLineIcon },
  { id: "downloads", label: "Downloads", icon: DownloadIcon },
]

export const SETTINGS_TAB: {
  id: StudioTab
  label: string
  icon: LucideIcon
} = { id: "settings", label: "Settings", icon: SettingsIcon }

export const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  ...MEDIA_TABS,
  ...UTILITY_TABS,
  SETTINGS_TAB,
]

export function tabFromPath(pathname: string): StudioTab {
  const seg = pathname.split("/").filter(Boolean)[0]
  if (
    seg === "video" ||
    seg === "audio" ||
    seg === "creator" ||
    seg === "downloads" ||
    seg === "tools" ||
    seg === "settings"
  ) {
    return seg
  }
  return "image"
}
