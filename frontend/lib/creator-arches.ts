/** Creator UI arch registry - product metadata (slots/defaults), not an IPC DTO. */

import type { RecipeCapabilities } from "@/lib/generated/bindings"
import { isRecipeArch, type RecipeArch } from "@/lib/arch"

type ArchId = RecipeArch

type ModelSlotDef = {
  role: string
  path: string
  label: string
  required: boolean
  /** Stock companion URL prefilled when this arch is selected. */
  defaultUrl?: string
}

type ArchDef = {
  id: ArchId
  label: string
  slots: ModelSlotDef[]
  sampler: string
  scheduler: string
  /** Local metadata - always fully specified (IPC RecipeCapabilities fields are optional). */
  capabilities: Required<RecipeCapabilities>
  /** Flux uses distilled guidance instead of CFG. */
  usesGuidance?: boolean
  defaults: {
    width: number
    height: number
    steps: number
    cfg: number
    seed: number
    guidance?: number
    clipType?: string
    auraShift?: number
    weightDtype?: string
    /** Ideogram 4 scheduler / DualModelGuider extras (baked into recipe). */
    mu?: number
    std?: number
    cfgOverride?: number
    cfgOverrideStart?: number
    cfgOverrideEnd?: number
    /** SD 3.5 ModelSamplingSD3 shift. */
    sd3Shift?: number
  }
}

const ARCHES: ArchDef[] = [
  {
    id: "z-image",
    label: "Z-Image",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors",
      },
    ],
    sampler: "res_multistep",
    scheduler: "simple",
    capabilities: {
      negative: false,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 8,
      cfg: 1,
      seed: 0,
      clipType: "lumina2",
      auraShift: 3,
    },
  },
  {
    id: "krea2",
    label: "Krea 2",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: false,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 8,
      cfg: 1,
      seed: 0,
      clipType: "krea2",
      weightDtype: "default",
    },
  },
  {
    id: "flux",
    label: "Flux.1",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "t5",
        path: "text_encoders",
        label: "T5 text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors",
      },
      {
        role: "clip_l",
        path: "text_encoders",
        label: "CLIP-L",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    usesGuidance: true,
    capabilities: {
      negative: false,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 1,
      seed: 0,
      guidance: 3.5,
      weightDtype: "default",
    },
  },
  {
    id: "flux2",
    label: "Flux.2",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "clip",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/text_encoders/mistral_3_small_flux2_bf16.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    usesGuidance: true,
    capabilities: {
      negative: false,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 1,
      seed: 0,
      guidance: 3.5,
      weightDtype: "default",
    },
  },
  {
    id: "ideogram4",
    label: "Ideogram 4",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_fp8_scaled.safetensors",
      },
      {
        role: "unet_uncond",
        path: "diffusion_models",
        label: "Unconditional diffusion model",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors",
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE (shared with Flux.2)",
        required: true,
        // Same bytes as Flux.2 — do not use Ideogram-4's similarly named file
        // (different size/hash; overwriting breaks Flux.2).
        defaultUrl:
          "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: false,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 7,
      seed: 0,
      weightDtype: "default",
      mu: 0,
      std: 1.75,
      cfgOverride: 3,
      cfgOverrideStart: 0.7,
      cfgOverrideEnd: 1,
    },
  },
  {
    id: "sdxl",
    label: "SDXL",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
      },
      { role: "vae", path: "vae", label: "VAE (optional)", required: false },
    ],
    sampler: "euler",
    scheduler: "normal",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 28,
      cfg: 7,
      seed: 0,
    },
  },
  {
    id: "sd15",
    label: "SD 1.5",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
      },
      { role: "vae", path: "vae", label: "VAE (optional)", required: false },
    ],
    sampler: "euler",
    scheduler: "normal",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 512,
      height: 512,
      steps: 20,
      cfg: 7,
      seed: 0,
    },
  },
  {
    id: "pony",
    label: "Pony",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
        defaultUrl:
          "https://huggingface.co/LyliaEngine/Pony_Diffusion_V6_XL/resolve/main/ponyDiffusionV6XL_v6StartWithThisOne.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE (optional)",
        required: false,
        defaultUrl:
          "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors",
      },
    ],
    sampler: "euler_ancestral",
    scheduler: "karras",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg: 7,
      seed: 0,
    },
  },
  {
    id: "qwen-image",
    label: "Qwen Image",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_fp8_e4m3fn.safetensors",
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 30,
      cfg: 2.5,
      seed: 0,
      clipType: "qwen_image",
      weightDtype: "default",
      auraShift: 3.1,
    },
  },
  {
    id: "illustrious",
    label: "Illustrious",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
      },
      { role: "vae", path: "vae", label: "VAE (optional)", required: false },
    ],
    sampler: "euler",
    scheduler: "normal",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 28,
      cfg: 5,
      seed: 0,
    },
  },
  {
    id: "sd3.5",
    label: "SD 3.5",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
        defaultUrl:
          "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/sd3.5_large.safetensors",
      },
      {
        role: "clip_l",
        path: "text_encoders",
        label: "CLIP-L",
        required: true,
        defaultUrl:
          "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/text_encoders/clip_l.safetensors",
      },
      {
        role: "clip_g",
        path: "text_encoders",
        label: "CLIP-G",
        required: true,
        defaultUrl:
          "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/text_encoders/clip_g.safetensors",
      },
      {
        role: "t5",
        path: "text_encoders",
        label: "T5-XXL",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 40,
      cfg: 4.5,
      seed: 0,
      sd3Shift: 3,
    },
  },
  {
    id: "chroma",
    label: "Chroma",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "T5 text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: true,
      loras: true,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 26,
      cfg: 4,
      seed: 0,
      clipType: "chroma",
      weightDtype: "default",
      auraShift: 1,
    },
  },
]

const ARCH_ITEMS = ARCHES.map((a) => ({ label: a.label, value: a.id }))

export type { ArchId, ModelSlotDef, ArchDef }
export { ARCHES, ARCH_ITEMS }

export function isArchId(value: string): value is ArchId {
  return isRecipeArch(value)
}
