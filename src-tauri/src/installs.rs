use directories::UserDirs;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::path::Path;
use sysinfo::Disks;

use crate::userdata;

#[derive(Serialize, Deserialize)]
pub struct ScanResult {
    selected_install_path: Option<String>,
    installs: Vec<Install>,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum Source {
    Steam,
    Local,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Install {
    pub path: String,
    pub icon: String,
    pub source: Source,
}

#[tauri::command]
pub async fn get_selected_install() -> Option<Install> {
    let settings = userdata::get_settings().await;
    let install_path = settings.selected_install.clone();

    if install_path.is_some() {
        let path = install_path.unwrap();
        let installs = settings.installs.clone().unwrap_or_default();
        let install = installs.iter().find(|i| i.path == path);
        if install.is_some() {
            Some(install.unwrap().clone())
        } else {
            None
        }
    } else {
        None
    }
}

#[tauri::command]
pub async fn select_install(path: Option<String>) {
    userdata::get_settings().await.selected_install = path;
    userdata::save_data().await;
}

#[tauri::command]
pub async fn add_manual_install() {
    let mut installs = userdata::get_settings()
        .await
        .installs
        .clone()
        .unwrap_or_default();

    let folder_picker = FileDialog::new()
        .set_title("Select the folder that contains the game")
        .pick_folder();

    if let Some(folder) = folder_picker {
        let path = folder.display().to_string();

        if installs.iter().any(|i| i.path == path) {
            return; // Duplicate install
        }

        installs.push(Install {
            path,
            icon: String::from("/logo.png"),
            source: Source::Local
        });

        userdata::get_settings().await.installs = Some(installs.clone());
        userdata::save_data().await;
    }
}


#[tauri::command]
pub async fn scan() -> ScanResult {
    let selected_install = userdata::get_settings()
        .await
        .selected_install
        .clone()
        .unwrap_or_default();
    let mut installs = userdata::get_settings()
        .await
        .installs
        .clone()
        .unwrap_or_default();
    let mut selected_install_path = None;

    let home_dir: String  = UserDirs::new().unwrap().home_dir().to_str().unwrap().into();
    let steam_folder = format!(
        "{}\\{}",
        home_dir, "AppData\\Local\\steamapps\\common\\Lethal Company"
    );

    if Path::new(&steam_folder).exists() {
        installs.push(Install {
            path: steam_folder,
            icon: String::from("/logo.png"),
            source: Source::Steam,
        });
    }

    let disks = Disks::new_with_refreshed_list();
    for disk in &disks {
        let path = format!(
            "{}\\{}",
            disk.mount_point()
                .to_str()
                .unwrap()
                .replace("\"", "")
                .replace("\\", ""),
            "SteamLibrary\\steamapps\\common\\Lethal Company"
        );
        if Path::new(&path).exists() && !installs.iter().any(|i| i.path == path) {
            installs.push(Install {
                path,
                icon: String::from("/logo.png"),
                source: Source::Steam,
            });
        }
    }

    for i in &installs {
        if i.path == selected_install {
            selected_install_path = Some(selected_install.clone());
        }
    }

    userdata::get_settings().await.installs = Some(installs.clone());
    userdata::save_data().await;

    ScanResult {
        selected_install_path,
        installs,
    }
}
