/**
 * Built-in ComfyUI KSampler / KSamplerSelect names.
 * Source: Comfy-Org/ComfyUI `comfy/samplers.py`
 *   SAMPLER_NAMES = KSAMPLER_NAMES + ["ddim", "uni_pc", "uni_pc_bh2"]
 *   SCHEDULER_NAMES = list(SCHEDULER_HANDLERS)
 * Regenerated from ComfyUI master (2026-07).
 *
 * Comfy stores/sends these snake_case ids; we show friendlier labels in UI.
 */

export const COMFY_SAMPLERS = [
  "euler",
  "euler_cfg_pp",
  "euler_ancestral",
  "euler_ancestral_cfg_pp",
  "heun",
  "heunpp2",
  "exp_heun_2_x0",
  "exp_heun_2_x0_sde",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpm_fast",
  "dpm_adaptive",
  "dpmpp_2s_ancestral",
  "dpmpp_2s_ancestral_cfg_pp",
  "dpmpp_sde",
  "dpmpp_sde_gpu",
  "dpmpp_2m",
  "dpmpp_2m_cfg_pp",
  "dpmpp_2m_sde",
  "dpmpp_2m_sde_gpu",
  "dpmpp_2m_sde_heun",
  "dpmpp_2m_sde_heun_gpu",
  "dpmpp_3m_sde",
  "dpmpp_3m_sde_gpu",
  "ddpm",
  "lcm",
  "ipndm",
  "ipndm_v",
  "deis",
  "res_multistep",
  "res_multistep_cfg_pp",
  "res_multistep_ancestral",
  "res_multistep_ancestral_cfg_pp",
  "gradient_estimation",
  "gradient_estimation_cfg_pp",
  "er_sde",
  "seeds_2",
  "seeds_3",
  "sa_solver",
  "sa_solver_pece",
  "ddim",
  "uni_pc",
  "uni_pc_bh2",
] as const

export const COMFY_SCHEDULERS = [
  "simple",
  "sgm_uniform",
  "karras",
  "exponential",
  "ddim_uniform",
  "beta",
  "normal",
  "linear_quadratic",
  "kl_optimal",
] as const

/** Snake_case KSampler id Comfy stores/sends — UI labels come from `comfyChoiceLabel`. */
export type ComfySampler = (typeof COMFY_SAMPLERS)[number]
/** Snake_case scheduler id from Comfy `SCHEDULER_HANDLERS` — same label mapping as samplers. */
export type ComfyScheduler = (typeof COMFY_SCHEDULERS)[number]

/** Select option: `value` is the Comfy id, `label` is the friendly display string. */
export type ComfyChoice = { label: string; value: string }

/** Override map for names that don't title-case cleanly. */
const LABEL_OVERRIDES: Record<string, string> = {
  euler: "Euler",
  euler_cfg_pp: "Euler CFG++",
  euler_ancestral: "Euler Ancestral",
  euler_ancestral_cfg_pp: "Euler Ancestral CFG++",
  heun: "Heun",
  heunpp2: "Heun++ 2",
  exp_heun_2_x0: "Exp Heun 2 x0",
  exp_heun_2_x0_sde: "Exp Heun 2 x0 SDE",
  dpm_2: "DPM 2",
  dpm_2_ancestral: "DPM 2 Ancestral",
  lms: "LMS",
  dpm_fast: "DPM Fast",
  dpm_adaptive: "DPM Adaptive",
  dpmpp_2s_ancestral: "DPM++ 2S Ancestral",
  dpmpp_2s_ancestral_cfg_pp: "DPM++ 2S Ancestral CFG++",
  dpmpp_sde: "DPM++ SDE",
  dpmpp_sde_gpu: "DPM++ SDE (GPU)",
  dpmpp_2m: "DPM++ 2M",
  dpmpp_2m_cfg_pp: "DPM++ 2M CFG++",
  dpmpp_2m_sde: "DPM++ 2M SDE",
  dpmpp_2m_sde_gpu: "DPM++ 2M SDE (GPU)",
  dpmpp_2m_sde_heun: "DPM++ 2M SDE Heun",
  dpmpp_2m_sde_heun_gpu: "DPM++ 2M SDE Heun (GPU)",
  dpmpp_3m_sde: "DPM++ 3M SDE",
  dpmpp_3m_sde_gpu: "DPM++ 3M SDE (GPU)",
  ddpm: "DDPM",
  lcm: "LCM",
  ipndm: "iPNDM",
  ipndm_v: "iPNDM v",
  deis: "DEIS",
  res_multistep: "Res Multistep",
  res_multistep_cfg_pp: "Res Multistep CFG++",
  res_multistep_ancestral: "Res Multistep Ancestral",
  res_multistep_ancestral_cfg_pp: "Res Multistep Ancestral CFG++",
  gradient_estimation: "Gradient Estimation",
  gradient_estimation_cfg_pp: "Gradient Estimation CFG++",
  er_sde: "ER SDE",
  seeds_2: "SEEDS 2",
  seeds_3: "SEEDS 3",
  sa_solver: "SA Solver",
  sa_solver_pece: "SA Solver PECE",
  ddim: "DDIM",
  uni_pc: "UniPC",
  uni_pc_bh2: "UniPC BH2",
  simple: "Simple",
  sgm_uniform: "SGM Uniform",
  karras: "Karras",
  exponential: "Exponential",
  ddim_uniform: "DDIM Uniform",
  beta: "Beta",
  normal: "Normal",
  linear_quadratic: "Linear Quadratic",
  kl_optimal: "KL Optimal",
}

/** Friendly sampler/scheduler label; override map first, else title-cased snake_case. */
export function comfyChoiceLabel(id: string): string {
  return (
    LABEL_OVERRIDES[id] ??
    id
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  )
}

export const COMFY_SAMPLER_ITEMS: ComfyChoice[] = COMFY_SAMPLERS.map(
  (value) => ({
    value,
    label: comfyChoiceLabel(value),
  })
)

export const COMFY_SCHEDULER_ITEMS: ComfyChoice[] = COMFY_SCHEDULERS.map(
  (value) => ({
    value,
    label: comfyChoiceLabel(value),
  })
)
