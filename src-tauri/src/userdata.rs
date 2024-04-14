use crate::installs::Install;
use directories::UserDirs;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{
    fs::create_dir,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::Arc,
};
use tauri::async_runtime::Mutex;
use tokio::sync::MutexGuard;

static SETTINGS: Lazy<Arc<Mutex<Settings>>> = Lazy::new(|| {
    Arc::new(Mutex::new(Settings {
        selected_install: None,
        installs: Some(vec![]),
        game_status: None
    }))
});

#[derive(Serialize, Deserialize, Clone)]
pub struct GameStatus {
    pub running: bool,
    pub profile: Option<String>,
    pub pid: u32
}

#[derive(Serialize, Deserialize)]
pub struct Settings {
    pub selected_install: Option<String>,
    pub installs: Option<Vec<Install>>,
    pub game_status: Option<GameStatus>
}

pub fn get_app_dir() -> String {
    let home_dir: String = UserDirs::new().unwrap().home_dir().to_str().unwrap().into();
    let app_dir = format!("{}\\{}", home_dir, "AppData\\Local\\LethalManager");
    app_dir
}

pub async fn setup() {
    let app_dir = get_app_dir();
    let profiles_path = format!("{}\\{}", &app_dir, "profiles");
    let config_file = format!("{}\\{}", &app_dir, "config.json");

    // Create directories
    if !Path::new(&app_dir).exists() {
        create_dir(&app_dir).unwrap();
    }
    if !Path::new(&profiles_path).exists() {
        create_dir(&profiles_path).unwrap();
    }

    if !Path::new(&config_file).exists() {
        save_data().await;
    } else {
        // Load settings
        let mut data = String::new();
        File::open(&config_file)
            .unwrap()
            .read_to_string(&mut data)
            .unwrap();

        let settings = serde_json::from_str::<Settings>(&data).unwrap();
        *SETTINGS.lock().await = settings;
    }
}

pub async fn save_data() {
    let app_dir = get_app_dir();
    let config_file = format!("{}\\{}", &app_dir, "config.json");

    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&config_file)
    {
        let settings = SETTINGS.lock().await;
        let buf = serde_json::to_string(&*settings).unwrap();
        f.write_all(buf.as_bytes()).unwrap();
    }
}

pub async fn get_settings<'a>() -> MutexGuard<'a, Settings> {
    return SETTINGS.lock().await;
}
