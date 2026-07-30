mod api;
mod gallery;
mod run;
mod types;
mod wait;

#[allow(unused_imports)]
pub use api::{download_view, free_vram, interrupt, queue_prompt};
#[allow(unused_imports)]
pub use gallery::{ensure_gallery_thumbnails, gallery_dir, write_gallery_thumbnail};
pub use run::run_generate;
#[allow(unused_imports)]
pub use types::ComfyImageRef;
#[allow(unused_imports)]
pub use wait::{collect_text, wait_for_outputs, wait_for_text};

#[cfg(test)]
mod tests {
    use super::gallery::{comfy_disk_path, next_gallery_dest};
    use super::ComfyImageRef;
    use crate::db::RuntimeInstall;
    use std::fs;
    use std::io::Write;
    use uuid::Uuid;

    #[test]
    fn gallery_dest_increments_comfy_counter() {
        let dir = std::env::temp_dir().join(format!("oga-gal-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&dir).unwrap();
        let first = next_gallery_dest(&dir, "krea2-turbo", "png");
        assert_eq!(first.file_name().unwrap(), "krea2-turbo_00001_.png");
        fs::File::create(&first).unwrap().write_all(b"x").unwrap();
        // Legacy collision names must not break the sequence.
        fs::File::create(dir.join("krea2-turbo_00001_2.png"))
            .unwrap()
            .write_all(b"x")
            .unwrap();
        let second = next_gallery_dest(&dir, "krea2-turbo", "png");
        assert_eq!(second.file_name().unwrap(), "krea2-turbo_00002_.png");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn comfy_path_under_output() {
        let runtime = RuntimeInstall {
            id: "r1".into(),
            engine: "comfyui".into(),
            version: "x".into(),
            install_path: r"C:\ComfyUI_windows_portable".into(),
            port: Some(8188),
            status: "running".into(),
            error: None,
            created_at: 0,
            updated_at: 0,
        };
        let image = ComfyImageRef {
            filename: "krea2-turbo_00001_.png".into(),
            subfolder: String::new(),
            image_type: "output".into(),
        };
        let path = comfy_disk_path(&runtime, &image).unwrap();
        assert!(
            path.ends_with(r"ComfyUI\output\krea2-turbo_00001_.png")
                || path.ends_with("ComfyUI/output/krea2-turbo_00001_.png")
        );
    }
}
