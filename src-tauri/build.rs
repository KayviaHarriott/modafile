use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=gif_exporter.swift");
    println!("cargo:rerun-if-changed=pdf_compat.swift");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
        let resources = manifest.join("resources");
        fs::create_dir_all(&resources).expect("GIF exporter resources directory");
        let status = Command::new("xcrun")
            .args(["swiftc", "gif_exporter.swift", "-framework", "AVFoundation", "-framework", "CoreImage", "-framework", "ImageIO", "-framework", "UniformTypeIdentifiers", "-o"])
            .arg(resources.join("gif-exporter"))
            .current_dir(&manifest)
            .status()
            .expect("Xcode command-line tools are required to build Modafile's GIF exporter");
        assert!(status.success(), "Could not build Modafile's GIF exporter");
        let status = Command::new("xcrun")
            .args(["swiftc", "pdf_compat.swift", "-framework", "AppKit", "-framework", "PDFKit", "-o"])
            .arg(resources.join("pdf-compat"))
            .current_dir(&manifest)
            .status()
            .expect("Xcode command-line tools are required to build Modafile's PDF checker");
        assert!(status.success(), "Could not build Modafile's PDF checker");
    }
    tauri_build::build()
}
