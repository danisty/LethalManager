// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod installs;
mod profiles;
mod thunderstore;
mod userdata;
mod utils;

use tauri::Manager;

use window_shadows::set_shadow;

#[tokio::main]
async fn main() {
    userdata::setup().await;
    tauri::Builder::default()
        .setup(|app| {
            // Add native shadow to window
            let Some(window) = app.get_window("main") else {
				return Ok(())
			};
            set_shadow(&window, true).expect("Unsupported platform!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            installs::scan,
            installs::select_install,
            installs::get_selected_install,
            installs::add_manual_install,
            thunderstore::load_package,
            thunderstore::search,
            profiles::play_profile,
            profiles::create_profile,
            profiles::delete_profile,
            profiles::get_profiles,
            profiles::get_profile,
            profiles::get_profile_mods,
            profiles::download_mod,
            profiles::delete_mod,
            profiles::toggle_mod,
            utils::show_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
