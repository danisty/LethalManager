use crate::{installs, profiles, thunderstore::{self, ModInfo, Version}, userdata::{self, GameStatus}, utils};
use std::{fs::{File, OpenOptions}, io::{Read, Write}, os::windows::process::CommandExt, path::Path};
use glob::glob;
use serde::{Deserialize, Serialize};
use regex::{Captures, Regex};
use futures_util::StreamExt;
use tauri::Window;

use async_recursion::async_recursion;
use std::process::{Command, Stdio};

#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub current_mod: String,
    pub total_progress: f32,
    pub extract_progress: f32
}

#[derive(Serialize, Deserialize)]
pub struct ProfileInfo {
    pub name: String,
    pub icon: Option<String>,
    pub mods_amount: usize,
    pub folder: String,
}

#[derive(Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub icon: Option<String>,
    pub folder: String
}

#[derive(Serialize, Deserialize)]
pub struct Manifest {
    pub version_number: String
}

#[tauri::command]
pub async fn get_game_status() -> GameStatus {
    let game_status = userdata::get_settings().await.game_status.clone();
    if let Some(game_status) = game_status {
        let s = sysinfo::System::new_all();
        let process = s.process(sysinfo::Pid::from_u32(game_status.pid));
        
        let new_game_status = if process.is_some() {
            userdata::get_settings().await.game_status = Some(game_status.clone());
            game_status
        } else {
            userdata::get_settings().await.game_status = None;
            GameStatus {
                running: false,
                profile: None,
                pid: 0
            }
        };

        userdata::save_data().await;
        new_game_status
    } else {
        GameStatus {
            running: false,
            profile: None,
            pid: 0
        }
    }
}


#[tauri::command]
pub async fn stop_game() {
    let pid = match &userdata::get_settings().await.game_status {
        Some(g) => g.pid,
        None => 0
    };
    if pid != 0 {
        let s = sysinfo::System::new_all();
        if let Some(process) = s.process(sysinfo::Pid::from_u32(pid)) {
            process.kill();
        }
        userdata::get_settings().await.game_status = None;
        userdata::save_data().await;
    }
}

#[tauri::command]
pub async fn play_profile(name: String) {
    let profile = get_profile(name).await;

    if let Some(install) = installs::get_selected_install().await {
        // Copy necessary files
        let source_doorstep_file = format!("{}\\doorstop_config.ini", &profile.folder);
        let source_winhttp_file = format!("{}\\winhttp.dll", &profile.folder);

        let target_doorstep_file = format!("{}\\doorstop_config.ini", &install.path);
        let target_winhttp_file = format!("{}\\winhttp.dll", &install.path);

        if !Path::new(&target_doorstep_file).exists() {
            std::fs::copy(source_doorstep_file, target_doorstep_file).unwrap();
        }
        if !Path::new(&target_winhttp_file).exists() {
            std::fs::copy(source_winhttp_file, target_winhttp_file).unwrap();
        }

        // Run game
        let executable = format!("{}\\Lethal Company.exe", &install.path);
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&executable)
            .arg("--doorstop-enable")
            .arg("true")
            .arg("--doorstop-target")
            .arg(&format!("{}\\BepInEx\\core\\BepInEx.Preloader.dll", &profile.folder))
            .creation_flags(utils::CREATE_NO_WINDOW)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap()
            .wait()
            .unwrap();

        let s = sysinfo::System::new_all();
        let process = s.processes_by_exact_name("Lethal Company.exe").next();

        userdata::get_settings().await.game_status = Some(GameStatus {
            running: true,
            profile: Some(profile.name),
            pid: process.unwrap().pid().as_u32()
        });
        userdata::save_data().await;
    }
}

#[tauri::command]
pub async fn get_profiles() -> Vec<ProfileInfo> {
    let app_dir = userdata::get_app_dir();
    let profiles_dir = format!("{app_dir}\\profiles");

    let mut profiles: Vec<ProfileInfo> = vec![];

    for path in std::fs::read_dir(&profiles_dir).unwrap() {
        let path = path.unwrap().path();
        let profile_file = format!("{}\\profile.json", path.display());

        if Path::new(&profile_file).exists() {
            let mut config = String::new();
            File::open(&profile_file).unwrap().read_to_string(&mut config).unwrap();
            
            let profile = serde_json::from_str::<Profile>(&config);
            if let Ok(p) = profile {
                let mods = get_profile_mods(p.name.clone()).await;
                profiles.push(ProfileInfo {
                    name: p.name,
                    icon: p.icon,
                    mods_amount: mods.len(),
                    folder: path.to_str().unwrap().into()
                })
            }
        }
    }

    profiles
}

#[tauri::command]
pub async fn get_profile(name: String) -> Profile {
    let app_dir = userdata::get_app_dir();
    let profile_dir = format!("{app_dir}\\profiles\\{name}");

    let mut buf = String::new();
    File::open(format!("{}\\profile.json", profile_dir, )).unwrap().read_to_string(&mut buf).unwrap();

    serde_json::from_str::<Profile>(&buf).unwrap()
}

fn save_mods_to_profile(profile: &str, mods: &Vec<ModInfo>) {
    let app_dir = userdata::get_app_dir();
    let mut mods_file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&format!("{app_dir}\\profiles\\{profile}\\mods.yml"))
        .unwrap();
    let mods_str = serde_yaml::to_string::<Vec<ModInfo>>(mods).unwrap();
    mods_file.write_all(mods_str.as_bytes()).unwrap();
}

pub async fn scan_profile_mods(profile: String) -> Vec<ModInfo> {
    let app_dir = userdata::get_app_dir();
    let plugins_dir = format!("{app_dir}\\profiles\\{profile}\\BepInEx\\plugins");

    let mut mods: Vec<ModInfo> = vec![];

    if Path::new(&plugins_dir).exists() {
        for path in std::fs::read_dir(&plugins_dir).unwrap() {
            let path = path.unwrap().path();
            let manifest_file = format!("{}\\manifest.json", path.display());
            let full_name = path.file_name().unwrap().to_str().unwrap();
    
            if Path::new(&manifest_file).exists() {
                let mut manifest_buf = vec![];
                File::open(&manifest_file).unwrap().read_to_end(&mut manifest_buf).unwrap();
                let manifest_str = String::from_utf8_lossy(&manifest_buf);
                
                let manifest = serde_json::from_str::<Manifest>(&manifest_str.trim_start_matches("\u{feff}"));
                if let Ok(m) = manifest {
                    let mut _mod = thunderstore::get_mod(&full_name).await;
                    let version = _mod.versions.iter().find(|v| v.version_number == m.version_number).unwrap();

                    let icon = {
                        let icon_path = format!("{}\\icon.png", path.display());
                        if Path::new(&icon_path).exists() {
                            Some(icon_path)
                        } else {
                            None
                        }
                    };
                    let enabled = {
                        let mut files = std::fs::read_dir(&path).unwrap();
                        !files.any(|f| f.unwrap().file_name().to_str().unwrap() == ".disabled")
                    };

                    mods.push(ModInfo {
                        name: _mod.name,
                        full_name: _mod.full_name,
                        description: version.description.clone(),
                        author: _mod.owner,
                        version_number: m.version_number,
                        dependencies: version.dependencies.clone(),
                        folder: path.display().to_string(),
                        icon,
                        enabled
                    });
                }
            }
        }
    }

    save_mods_to_profile(&profile, &mods);

    mods
}

#[tauri::command]
pub async fn get_profile_mods(profile: String) -> Vec<ModInfo> {
    let app_dir = userdata::get_app_dir();
    let mods_file = format!("{app_dir}\\profiles\\{profile}\\mods.yml");

    if let Ok(mut f) = File::open(&mods_file) {
        let mut mods = String::new();
        f.read_to_string(&mut mods).unwrap();
        serde_yaml::from_str::<Vec<ModInfo>>(&mods).unwrap()
    } else {
        scan_profile_mods(profile).await
    }
}

#[tauri::command]
pub async fn create_profile(name: String, icon: Option<String>) -> Result<(), String> {
    let app_dir = userdata::get_app_dir();
    let profiles_dir = format!("{app_dir}\\profiles");

    let name_pattern = Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap();
    if let Some(_) = name_pattern.captures(&name) {
        let profile_dir = format!("{profiles_dir}\\{name}");

        if Path::new(&profile_dir).exists() {
            return Err(String::from("A profile with that name already exists"));
        } else {
            std::fs::create_dir(&profile_dir).unwrap();
        }

        let icon = match icon {
            Some(icon) => {
                let (extension, image) = if icon.starts_with("data:image/") {
                    (
                        icon.split_once(';').unwrap().0["data:image/".len()..].to_owned(),
                        image_base64::from_base64(icon)
                    )
                } else {
                    (
                        icon.split('.').last().unwrap().to_owned(),
                        reqwest::get(&icon).await.unwrap().bytes().await.unwrap().to_vec()
                    )
                };
                let path = format!("{profile_dir}\\icon.{extension}");
                
                OpenOptions::new()
                    .create(true)
                    .write(true)
                    .open(&path)
                    .unwrap()
                    .write_all(&image)
                    .unwrap();

                Some(path)
            }
            None => None
        };

        let profile_config_file = format!("{profile_dir}\\profile.json");
        OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .open(&profile_config_file)
            .unwrap()
            .write_all(
                serde_json::to_string(&Profile {
                    name,
                    icon,
                    folder: profile_dir
                }).unwrap().as_bytes()
            ).unwrap();

        Ok(())
    } else {
        Err(String::from("Invalid profile name."))
    }
}

#[tauri::command]
pub async fn delete_profile(name: String) {
    let app_dir = userdata::get_app_dir();
    let profile_dir = format!("{app_dir}\\profiles\\{name}");
    std::fs::remove_dir_all(profile_dir).unwrap();
}

#[tauri::command]
pub async fn delete_mod(profile: String, name: String) {
    // Checking dependencies would be a great idea here

    let mods = get_profile_mods(profile.clone()).await;
    if let Some(_mod) = mods.iter().find(|m| m.full_name == name) {
        let external_files = format!("{}\\{}", _mod.folder, "external_files.json");
        if Path::new(&external_files).exists() {
            let mut buf = String::new();
            File::open(&external_files).unwrap().read_to_string(&mut buf).unwrap();

            let files = serde_json::from_str::<Vec<String>>(&buf).unwrap();
            for f in files {
                let _ = std::fs::remove_file(&f);
            }
        }

        std::fs::remove_dir_all(&_mod.folder).unwrap();
        scan_profile_mods(profile).await;
    }
}

#[tauri::command]
pub async fn toggle_mod(profile: String, name: String) {
    // Checking dependencies would be a great idea here

    let profile = get_profile(profile).await;
    let mut mods = get_profile_mods(profile.name.clone()).await;

    if let Some(_mod) = mods.iter_mut().find(|m| m.full_name == name) {
        // Disable/Enable all DLL files
        for entry in glob(&format!("{}/**/*.dll*", _mod.folder)).unwrap() {
            let file = entry.unwrap();
            let filepath = file.display().to_string();

            if _mod.enabled && !filepath.ends_with(".disabled") {
                std::fs::rename(&filepath, format!("{filepath}.disabled")).unwrap();
            } else if !_mod.enabled && filepath.ends_with(".disabled") {
                std::fs::rename(&filepath, &filepath[0..filepath.len()-9]).unwrap();
            }
        }
        
        // Disable/Enable external files
        let external_files = format!("{}\\{}", _mod.folder, "external_files.json");

        if Path::new(&external_files).exists() {
            let mut buf = String::new();
            File::open(&external_files).unwrap().read_to_string(&mut buf).unwrap();

            let files = serde_json::from_str::<Vec<String>>(&buf).unwrap();
            let disabled_folder = format!("{}\\.disabled", _mod.folder);

            if _mod.enabled {
                // Disable
                if !Path::new(&disabled_folder).exists() {
                    std::fs::create_dir(&disabled_folder).unwrap();
                }
                for f in files {
                    let filename = utils::str_skip_to(&f, "BepInEx/");
                    let relative_path = format!("{}\\.disabled\\{}", _mod.folder, filename);
                    
                    if !Path::new(&relative_path).parent().unwrap().exists() {
                        std::fs::create_dir_all(Path::new(&relative_path).parent().unwrap()).unwrap();
                    }
                    if Path::new(&f).exists() {
                        std::fs::rename(&f, &relative_path).unwrap();
                    }
                }
            } else {
                // Enable
                if !Path::new(&disabled_folder).exists() {
                    return; // There aren't any disabled external files
                }
                for f in files {
                    let filename = utils::str_skip_to(&f, "BepInEx/");
                    let relative_path = format!("{}\\.disabled\\{}", _mod.folder, filename);

                    if Path::new(&relative_path).exists() {
                        std::fs::rename(&relative_path, &f).unwrap();
                    }
                }
            }
        }

        _mod.enabled = !_mod.enabled;
        save_mods_to_profile(&profile.name, &mods);
    }
}

fn fix_path(str: &str) -> String {
    Regex::new(r"(?i)bepinex/(.+?)/(.+)").unwrap().replace(str, |caps: &Captures| {
        format!("BepInEx/{}/{}", caps[1].to_lowercase(), &caps[2])
    }).to_string()
}

fn extract_mod(mod_name: &str, file_path: &str, profile_dir: &str, on_extract: impl Fn(f32) -> ()) {
    let zip_file = File::open(file_path).unwrap();
    let mut archive = zip::ZipArchive::new(zip_file).unwrap();
    let mut external_files: Vec<String> = vec![];
    
    let mod_folder = format!("{}\\{}\\{}", profile_dir, "BepInEx\\plugins", mod_name);
    if !Path::new(&mod_folder).exists() && mod_name != "BepInEx-BepInExPack" {
        std::fs::create_dir_all(&mod_folder).unwrap();
    }
    
    // First iteration to find the folder where the mod is located
    let mut dll_folder = String::from("*");
    for i in 0..archive.len() {
        let file = archive.by_index(i).unwrap();
        let file_path = file.name();

        if file_path.ends_with(".dll") {
            let mut path = Path::new(file_path);
            loop {
                let parent = path.parent();
                if parent.is_none() || parent.unwrap().display().to_string().to_lowercase().ends_with("plugins") {
                    if path == Path::new(file_path) { // Make sure we aren't targeting the dll
                        dll_folder = format!("{}/", parent.unwrap().to_str().unwrap());
                    } else {
                        dll_folder = format!("{}/", path.to_str().unwrap());
                    }
                    break;
                }
                path = parent.unwrap();
            }
        }

        // Fix path in case of incorrect naming
        dll_folder = fix_path(&dll_folder);
    }

    // Second iteration to extract files
    let files_amount = archive.len();
    for i in 0..files_amount {
        let mut file = archive.by_index(i).unwrap();

        // Report current extraction progress
        on_extract(i as f32 / files_amount as f32 * 100.0);
        
        // Fix path in case of incorrect naming
        let file_path = fix_path(file.name());
        let file_name;

        if let Some(p) = file.enclosed_name() {
            file_name = String::from(p.file_name().unwrap().to_str().unwrap());
        } else {
            continue; // Invalid file path
        }

        // Thunderstore's BepInEx mod has a different folder structure. Adapt it to the wanted structure
        if mod_name == "BepInEx-BepInExPack" && file_path.starts_with("BepInExPack/") && file_path != "BepInExPack/" {
            let path = format!("{}\\{}", profile_dir, file_path.chars().skip(12).collect::<String>()); // Remove "BepInExPack/"
            if file.is_dir() {
                std::fs::create_dir_all(&path).unwrap();
            } else {
                utils::extract_file(&mut file, &path);
            }
            continue;
        }

        if file.is_dir() {
            continue;
        }
        
        let parent = Path::new(&file_path).parent().unwrap();

        let path_in_dll_folder = file_path.starts_with(&dll_folder);
        let file_in_plugins = parent.ends_with("plugins");

        let outpath = if Regex::new(r"(?i)bepinex/").unwrap().is_match(&file_path) {
            let sub_path = &file_path["BepInEx/".len()..];
            match sub_path.split_once('/') {
                Some(("config", path)) => format!("{}\\BepInEx\\config\\{}", profile_dir, path),
                Some(("plugins", path)) =>  if path_in_dll_folder || file_in_plugins {
                    // Save in mod folder
                    format!("{}\\{}", mod_folder, path.replace(&dll_folder, ""))
                } else {
                    // Save in plugins folder
                    if dll_folder == "*" {
                        format!("{}\\BepInEx\\plugins\\{}", profile_dir, path)
                    } else {
                        format!("{}\\BepInEx\\plugins\\{}", profile_dir, path.replace(&dll_folder, ""))
                    }
                },
                Some(("patchers", path)) => format!("{}\\{}", mod_folder, path),
                _ => format!("{}\\BepInEx\\plugins\\{}", profile_dir, sub_path),
            }
        } else if file_path.starts_with("config/") {
            format!("{}\\BepInEx\\config\\{}", profile_dir, file_path.replace("config/", ""))
        } else if file_path.starts_with("plugins/") {
            if path_in_dll_folder || file_in_plugins {
                // Save in mod folder
                format!("{}\\{}", mod_folder, file_path.replace(&dll_folder, ""))
            } else {
                // Save in plugins folder
                if dll_folder == "*" {
                    let path = &file_path["plugins/".len()..];
                    format!("{}\\BepInEx\\plugins\\{}", profile_dir, path)
                } else {
                    format!("{}\\BepInEx\\plugins\\{}", profile_dir, file_path.replace(&dll_folder, ""))
                }
            }
        } else if file_path.starts_with("patchers/") {
            format!("{}\\BepInEx\\patchers\\{}\\{}", profile_dir, mod_name, file_path.replace("patchers/", ""))
        } else if file_path.contains("/") {
            format!("{}\\BepInEx\\plugins\\{}", profile_dir, file_path)
        } else {
            format!("{}\\{}", mod_folder, file_name)
        };

        let file_stored_outside = !outpath.starts_with(&mod_folder);
        if file_stored_outside {
            external_files.push(outpath.clone().replace("\\", "/"));
        }

        utils::extract_file(&mut file, &outpath);
    }

    // Store all created external files to later remove/disable the mod
    if external_files.len() > 0 {
        let mut ef_file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&format!("{}\\{}", mod_folder, "external_files.json"))
            .unwrap();
        let buf = serde_json::to_string::<Vec<String>>(&external_files).unwrap();
        ef_file.write_all(buf.as_bytes()).unwrap();
    }
}

fn get_absolute_version(version_number: &str) -> u32 {
    let n_split: Vec<&str> = version_number.split('.').collect();
    n_split[0].parse::<u32>().unwrap()*100 +
    n_split[1].parse::<u32>().unwrap()*10 +
    n_split[0].parse::<u32>().unwrap()
}

#[async_recursion]
pub async fn get_dependencies(version_name: &str, deps: &mut Vec<Version>, profile_mods: &Vec<ModInfo>) {
	let (full_name, version_number) = thunderstore::parse_mod_version(version_name);
    let mut has_newer_version = false;

    // Check on found dependencies
    let ind = deps.iter().position(|m| m.full_name.contains(&full_name));
    if let Some(i) = ind {
        if get_absolute_version(&version_number) > get_absolute_version(&deps[i].version_number) {
            has_newer_version = true;
        } else {
            return; // Don't add dependency with a lower version than previously found one
        }
    }

    // Check installed dependency (if exists)
    if let Some(i) = profile_mods.iter().position(|m| m.full_name == full_name) {
        if get_absolute_version(&version_number) <= get_absolute_version(&profile_mods[i].version_number) {
            return; // Don't add dependency with an equal or lower version than the installed one
        }
    }

    if let Some(_mod) = thunderstore::get_mod_version(version_name).await {
        let dependencies = _mod.dependencies.clone();

        if has_newer_version {
            deps[ind.unwrap()] = _mod;
        } else {
            deps.insert(0, _mod);
        }

        for dep in &dependencies {
            get_dependencies(dep, deps, profile_mods).await;
        }
    }
}

#[tauri::command]
pub async fn download_mod(window: Window, profile_name: String, version_name: String) {
    let profile = profiles::get_profile(profile_name.clone()).await;
    let profile_mods = get_profile_mods(profile_name.clone()).await;
    let mut mods_to_download: Vec<Version> = vec![];

    get_dependencies(&version_name, &mut mods_to_download, &profile_mods).await;

    let mods_amount = mods_to_download.len();
    for i in 0..mods_amount {
        let _mod = mods_to_download.get(i).unwrap();
        let temp_dir = std::env::temp_dir();
        let temp_file = format!("{}{}.zip", temp_dir.display(), &_mod.full_name);
        let total_progress = i as f32 / mods_amount as f32 * 100.0;

        window.emit("download_progress", DownloadProgress {
            current_mod: format!("Downloading {}...", &_mod.name),
            total_progress,
            extract_progress: 0.0
        }).unwrap();

        if !Path::new(&temp_file).exists() {
            println!("Downloading {}...", _mod.full_name);
            if let Ok(r) = reqwest::get(&_mod.download_url).await {
                let mut file = OpenOptions::new().write(true).create(true).open(&temp_file).unwrap();
                let mut stream = r.bytes_stream();
        
                while let Some(chunk) = stream.next().await {
                    file.write_all(&chunk.unwrap()).unwrap();
                }
            } else {
                println!("Failed to get mod.");
            }
        }

        let mut name_parts = _mod.full_name.split('-').collect::<Vec<&str>>();
        name_parts.pop();

        extract_mod(&name_parts.join("-"), &temp_file, &profile.folder, |e_p| {
            window.emit("download_progress", DownloadProgress {
                current_mod: format!("Extracting {}...", &_mod.name),
                total_progress,
                extract_progress: e_p
            }).unwrap();
        });
    }

    window.emit("download_progress", DownloadProgress {
        current_mod: String::from("Scanning profile mods..."),
        total_progress: 99.9,
        extract_progress: 100.0
    }).unwrap();

    scan_profile_mods(profile_name).await;

    window.emit("download_progress", DownloadProgress {
        current_mod: String::from("Done :)"),
        total_progress: 100.0,
        extract_progress: 100.0
    }).unwrap();

    println!("Done!");
}
