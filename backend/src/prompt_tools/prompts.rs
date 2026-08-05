//! Target dialect hints and custom/enhance prompt strings.

use super::types::PromptTarget;

pub(crate) fn target_dialect_hint(target: PromptTarget) -> &'static str {
    match target {
        PromptTarget::Auto => "",
        PromptTarget::Flux => {
            " Optimize for Flux: natural prose, cinematography, lighting, and materials. Avoid quality-tag spam (masterpiece, 8k)."
        }
        PromptTarget::StableDiffusion => {
            " Optimize for Stable Diffusion / SDXL: comma-separated tags and quality boosters are welcome."
        }
        PromptTarget::Ideogram => {
            " Optimize for Ideogram: clear subject and style; note any text that should appear in the image."
        }
        PromptTarget::QwenImage => {
            " Optimize for Qwen-Image: natural-language description with clear subject, style, \
composition, and lighting; avoid SD quality-tag spam (masterpiece, 8k, best quality)."
        }
        PromptTarget::ZImageKrea => {
            " Optimize for Z-Image / Krea turbo models: concise medium-length prose with strong \
subject focus; keep depth order (foreground vs behind) and distinctive lighting/capture feel \
(flash, grain, hard shadows) - layout and feel matter as much as the subject."
        }
    }
}

/// Checklist so captions are dense enough to recreate the image as closely as text allows.
fn recreation_detail_instruction() -> &'static str {
    "Goal: a prompt that could recreate this image as closely as possible - same subject, same \
spatial layout (what is in front of what), same camera perspective, and same photographic feel. \
Stick to visible details; never invent unread names, brands, or props.\n\
Cover all of the following when present:\n\
1) Medium & capture character - photo / illustration / anime / 3D / painting; and for photos, \
name the capture look when it is distinctive: on-camera flash snapshot, film grain, phone camera, \
studio strobe, candid point-and-shoot, polished DSLR, CGI-clean, etc. When the look evokes a \
specific era or format, say so (e.g. Polaroid / Instax, disposable camera, early-2000s digicam flash, \
1990s point-and-shoot film, vintage slide film, modern mirrorless). Mention visible grain, noise, \
color cast, or compression that sells that era. Do not default to soft cinematic language unless \
the image actually looks that way.\n\
2) Subjects - count and who/what; for people: apparent age range, gender presentation, body type, \
hair (color, length, style), facial features, expression, skin tone, distinctive marks; for objects: \
shape, material, color, condition.\n\
3) Pose & action - facing direction (toward camera, away, left, right, three-quarter), body pose, \
hand positions, gaze, what they are doing. Never say only \"a person\".\n\
4) Clothing & accessories - garments, colors, materials/textures, jewelry, bags, glasses, hats.\n\
5) Spatial layout (critical) - depth order from camera: what sits in the near foreground, midground, \
and background. State whether the subject is in front of, behind, between, or peeking over props. \
Name occlusion (e.g. drums in foreground framing/hiding the lower body). Left/right placement of \
each major object. Do not flatten the scene into a single plane or invent a cleaner layout than \
what is shown.\n\
6) Camera & perspective - shot type (extreme close-up through extreme wide), camera height vs subject \
(worm's-eye, eye-level with subject, looking down), tilt, distance, how close foreground objects \
are to the lens, depth of field (what is sharp vs soft).\n\
7) Setting - environment, architecture, props, weather, time of day, indoor/outdoor; surface colors \
(carpet, walls) as seen.\n\
8) Lighting - critical for feel: flash vs ambient, hard vs soft shadows, shadow direction and \
length on nearby surfaces, color temperature, specular highlights on metal/glass/eyes, rim/backlight. \
If the image has harsh direct flash and hard shadows, say so - never rewrite that as dim ambient \
or soft shadows.\n\
9) Color & texture - dominant palette, contrast level, notable materials (metal, fabric, fur, glass).\n\
10) Text - quote any readable text, logos, or signage exactly; omit if none."
}

fn output_only_rules() -> &'static str {
    "Avoid meta phrases like \"This image shows\" or \"You are looking at\". Never append Notes, \
disclaimers, compliance commentary, explanations, or markdown headers after the prompt. \
Output ONLY the prompt text."
}

pub(crate) fn general_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Write a single dense text-to-image prompt that could recreate this image almost 1:1, \
matching subject, spatial layout/perspective, and the photo's look/feel (lighting, grain, contrast).\n\
Put depth order early in the prompt (e.g. \"foreground drums, subject behind them\") so generators \
do not restage the scene.\n\
{}\n\
Weave the checklist into flowing generation-ready language (not a numbered list). Prefer concrete \
nouns and visual facts over mood words. {}.{}",
        recreation_detail_instruction(),
        output_only_rules(),
        target_dialect_hint(target)
    )
}

pub(crate) fn structured_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Analyze this image for near-1:1 recreation. Output ONLY these labeled sections, one per line, \
using exactly these labels:\n\
Medium: …\n\
Subject: … (appearance, count, expression - never vague)\n\
Pose: … (facing, body, hands, gaze, action)\n\
Clothing: …\n\
Composition: … (depth order front→back, behind/in front/between/peeking over, left/right, occlusion, aspect)\n\
Setting: …\n\
Style: …\n\
Lighting: … (flash vs ambient, hard/soft shadows, color temp)\n\
Camera: … (shot type, height vs subject, tilt, distance, DOF)\n\
Colors: …\n\
Text: … (quote exactly, or none)\n\
Details: … (props, materials, grain/noise, anything else needed to recreate)\n\
{}. {}.{}",
        recreation_detail_instruction(),
        output_only_rules(),
        target_dialect_hint(target)
    )
}

pub(crate) fn json_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Analyze this image for near-1:1 recreation. Respond with ONLY a valid JSON object (no markdown) \
using keys: medium, subject, pose_and_facing, clothing, composition, camera_shot, setting, style, \
lighting, colors (array of strings), visible_text, details, \
negative_suggestions (array of strings for things that would break the recreation). \
Fill every key with concrete visual facts including depth order/perspective and capture feel \
(flash, grain, contrast). No Notes or commentary outside the JSON. {}.{}",
        recreation_detail_instruction(),
        target_dialect_hint(target)
    )
}

pub(crate) fn graphic_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Describe this image as a graphic-design brief that could recreate the layout almost 1:1: \
medium, layout grid, typography (font feel, weight, size hierarchy), brand feel, exact color palette, \
composition hierarchy, subject placement/facing if figures are present, negative space, and any \
visible text (quote exactly). {}. Write a single cohesive prompt. {}.{}",
        recreation_detail_instruction(),
        output_only_rules(),
        target_dialect_hint(target)
    )
}

fn style_look_bit(look: &str) -> &'static str {
    match look {
        "anime" => {
            "Rewrite as an ANIME / manga illustration prompt (not a photo). State the medium up front \
(e.g. anime still, 2D illustration). Keep the same person, outfit, pose, and setting, but replace \
photographic language (photograph, DSLR, realistic skin pores, cinematic photo lighting) with \
anime cues: clean linework, cel shading, expressive eyes, illustrative hair, vibrant colors. \
The result must clearly read as anime-styled."
        }
        "product" => {
            "Rewrite as a commercial PRODUCT shot. Keep the core subject, but reframe as studio \
catalog lighting, simple backdrop, sharp material/finish detail, and advertising composition. \
Remove unrelated lifestyle clutter when it fights a clean product read."
        }
        "portrait" => {
            "Rewrite as a PORTRAIT prompt: face and upper body focus, flattering light, shallow \
depth of field, expression andwardrobe detail. Keep identity and outfit; de-emphasize wide \
environment unless it supports the portrait."
        }
        _ => {
            "Rewrite as a CINEMATIC film still: dramatic keyed light, lens/camera language, \
color grade, atmosphere, and composition. Keep the same subject and scene; make it feel like \
a movie frame rather than a casual snapshot."
        }
    }
}

pub(crate) fn enhance_system_prompt(target: PromptTarget, mode: &str) -> String {
    let style_look = mode
        .strip_prefix("style:")
        .or_else(|| (mode == "style").then_some("cinematic"));
    let mode_bit = if let Some(look) = style_look {
        style_look_bit(look)
    } else {
        match mode {
            "short" => {
                "Keep the result concise (under ~40 words). Cut filler; keep subject, key look, and one setting cue."
            }
            "tags" => {
                "Convert the idea into comma-separated descriptive tags for Stable Diffusion \
(booru-ish / SDXL style). No full sentences, no preamble. Keep subject and important details; \
drop prose connectors."
            }
            "lighting" => {
                "Rewrite so lighting and camera are central: light direction/quality, color temperature, \
lens/focal length, depth of field, and atmosphere. Keep the same subject; trim details that \
don't serve light or camera."
            }
            "clean" => {
                "Declutter only: remove fluff, contradictions, and quality-tag spam \
(masterpiece, 8k, best quality, ultra detailed). Do not add new scene details. Keep subject \
and intent; tighten wording."
            }
            "composition" => {
                "Rewrite with composition first: framing (close-up/wide/etc.), camera angle, \
lens/focal length, depth of field, and subject placement in the frame. Keep the same subject \
and setting; make shot geometry explicit."
            }
            "concrete" => {
                "Replace vague adjectives (beautiful, nice, amazing) with specific materials, \
colors, props, textures, and countable details. Do not invent a new subject or location - \
only sharpen what is already implied."
            }
            _ => {
                "Expand into a richer, ready-to-use image prompt with clearer detail and context. \
Add useful sensory/scene specifics without changing the core subject."
            }
        }
    };
    let style_override = if style_look.is_some() {
        " Style mode: you MUST change the visual medium/look as instructed - do not lightly paraphrase. \
If the input says photograph/realistic/cinematic photo, override that to match the requested look."
    } else {
        ""
    };
    format!(
        "You rewrite user ideas into text-to-image prompts. Preserve core subject and intent. \
Output ONLY the final prompt, no preamble. {mode_bit}{style_override}{}",
        target_dialect_hint(target)
    )
}
