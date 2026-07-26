import type { StudioTab } from "@/lib/host"

export const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "tools", label: "Tools" },
  { id: "creator", label: "Creator" },
  { id: "downloads", label: "Downloads" },
]

export function tabFromPath(pathname: string): StudioTab {
  const seg = pathname.split("/").filter(Boolean)[0]
  if (
    seg === "video" ||
    seg === "audio" ||
    seg === "creator" ||
    seg === "downloads" ||
    seg === "tools"
  ) {
    return seg
  }
  return "image"
}
