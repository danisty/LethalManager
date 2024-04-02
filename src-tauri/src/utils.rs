use std::{os::windows::process::CommandExt, path::Path};
use zip::read::ZipFile;

pub const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn show_in_explorer(path: String) {
    std::process::Command::new("cmd")
        .arg("/C")
        .arg("explorer")
        .arg(&path)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .unwrap();
}

pub fn create_symlink(symlink: &str, destination: &str) {
    let symlink = symlink.trim_end_matches('/');
    let destination = destination.trim_end_matches('/');

    if Path::new(symlink).exists() {
        return;
    }

    std::process::Command::new("cmd")
        .arg("/C")
        .arg("mklink")
        .arg("/J")
        .arg(symlink)
        .arg(destination)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .unwrap();

    println!("Created symlink from {} -> {}", symlink, destination);
}

pub fn extract_file(file: &mut ZipFile, outpath: &str) {
    // println!("Extracted file {}", outpath);

    if let Some(p) = Path::new(&outpath).parent() {
        if !p.exists() {
            std::fs::create_dir_all(p).unwrap();
        }
    }

    let mut outfile = std::fs::File::create(&outpath).unwrap();
    std::io::copy(file, &mut outfile).unwrap();
}

pub fn str_skip_to<'a>(str: &'a str, to: &str) -> &'a str {
    let i = str.find(to).unwrap_or(0);
    return &str[i..];
}
