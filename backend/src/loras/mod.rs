//! Official + user LoRA packs (multi-arch variants).
//! Files live in the shared `models/loras/` library; manifests are metadata only.

mod catalog;
mod install;
mod types;
mod uninstall;
mod user;

#[allow(unused_imports)]
pub use catalog::{get_lora, list_loras, official_dir, open_user_loras_dir, user_dir};
#[allow(unused_imports)]
pub use install::{install_variant, variant_download, VariantDownload};
#[allow(unused_imports)]
pub use types::{LoraPack, LoraVariant, LoraVariantInfo, SaveUserLoraArgs};
#[allow(unused_imports)]
pub use uninstall::{uninstall_all_variants, uninstall_variant};
pub use user::{
    clear_user_lora_thumbnail, delete_user_lora, resolve_stack_for_generate, save_user_lora,
    set_user_lora_thumbnail,
};
