use std::collections::HashMap;

use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, MutexGuard};

pub static PACKAGE: Lazy<Mutex<Package>> = Lazy::new(|| {
    Mutex::new(Package {
        categories: vec![],
        mods: HashMap::new(),
    })
});

static BUSY: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static INTERRUPT: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

#[derive(Serialize, Deserialize, Clone)]
pub struct Package {
    pub categories: Vec<String>,
    pub mods: HashMap<String, Mod>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchResults {
    pub categories: Vec<String>,
    pub mods: Vec<Mod>,
    pub pages: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ModInfo {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub author: String,
    pub version_number: String,
    pub dependencies: Vec<String>,
    pub folder: String,
    pub icon: Option<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Mod {
    pub categories: Vec<String>,
    pub date_created: DateTime<Utc>,
    pub date_updated: DateTime<Utc>,
    pub full_name: String,
    pub has_nsfw_content: bool,
    pub is_deprecated: bool,
    pub is_pinned: bool,
    pub name: String,
    pub owner: String,
    pub package_url: String,
    pub rating_score: i32,
    pub uuid4: String,
    pub versions: Vec<Version>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Version {
    pub date_created: DateTime<Utc>,
    pub dependencies: Vec<String>,
    pub description: String,
    pub download_url: String,
    pub downloads: i32,
    pub file_size: i64,
    pub full_name: String,
    pub icon: String,
    pub is_active: bool,
    pub name: String,
    pub uuid4: String,
    pub version_number: String,
    pub website_url: String,
}

#[derive(Serialize, Deserialize)]
pub struct Types {
    #[serde(rename = "Mods")]
    pub mods: i8,
    #[serde(rename = "Modpacks")]
    pub modpacks: i8,
}

#[tauri::command]
pub async fn load_package() {
    let res = reqwest::get("https://thunderstore.io/c/lethal-company/api/v1/package/")
        .await
        .unwrap();
    let data = res.text().await.unwrap();

    let mut mods: HashMap<String, Mod> = HashMap::new();
    let mut mods_v: Vec<Mod> = serde_json::from_str(&data).unwrap();
    let mut categories: Vec<String> = vec![];

    mods_v.remove(0); // Remove r2modman

    for m in mods_v {
        for c in &m.categories {
            if c == "Mods" || c == "Modpacks" {
                continue;
            }
            if !categories.iter().any(|x| c == x) {
                categories.push(c.clone());
            }
        }
        mods.insert(m.full_name.clone(), m);
    }

    categories.sort();

    *PACKAGE.lock().await = Package { categories, mods }
}

pub async fn get_package<'a>() -> MutexGuard<'a, Package> {
    return PACKAGE.lock().await;
}

pub fn parse_mod_version(version_name: &str) -> (String, String) {
    let mut v_split: Vec<&str> = version_name.split('-').collect();
    let version_number = v_split.pop().unwrap().to_owned();
    let full_name = v_split.join("-");
    (full_name, version_number)
}

pub async fn get_mod(full_name: &str) -> Mod {
    let package = get_package().await;
    package.mods.get(full_name).unwrap().clone()
}

pub async fn get_mod_version(version_name: &str) -> Option<Version> {
    let (full_name, version_number) = parse_mod_version(version_name);
    let package = get_package().await;

    match package.mods.get(&full_name) {
        Some(t_mod) => Some(
            t_mod
                .versions
                .iter()
                .find(|v| v.version_number == version_number)
                .unwrap()
                .clone(),
        ),
        None => None,
    }
}

#[tauri::command]
pub async fn search(
    query: String,
    page: usize,
    sort: String,
    types: Types,
    categories: Vec<String>,
) -> Result<SearchResults, ()> {
    if *BUSY.lock().await {
        *INTERRUPT.lock().await = true; // Stop searching, client started a new search
    }

    *BUSY.lock().await = true;

    let mut mods: Vec<&Mod> = vec![];
    // let mut fuzzy_mods: Vec<&Mod> = vec![];
    let package = get_package().await;
    let re = Regex::new(&format!("(?i){}", &query)).unwrap();

    for (_, m) in &package.mods {
        if m.full_name == "BepInEx-BepInExPack" {
            continue;
        }

        let content = format!("{} {} {}", m.full_name, m.name, m.versions[0].description);
        let mut contains_type = (types.mods == 0 && (types.modpacks == 0 || types.modpacks == -1))
                                    || (types.mods == -1 && types.modpacks == 0);
        let mut contains_category = categories.len() == 0;

        if *INTERRUPT.lock().await {
            *INTERRUPT.lock().await = false;
            return Err(());
        }

        if types.mods == 1 && m.categories.iter().any(|c| c == "Mods") || types.modpacks == 1 && m.categories.iter().any(|c| c == "Modpacks") {
            contains_type = true;
        }
        if !contains_type { continue }

        if types.mods == -1 && m.categories.iter().any(|c| c == "Mods") || types.modpacks == -1 && m.categories.iter().any(|c| c == "Modpacks") {
            contains_type = false;
        }
        if !contains_type { continue }

        for c in &m.categories {
            if categories.contains(c) {
                contains_category = true;
                break;
            }
        }
        if !contains_category {
            continue;
        }

        // Keyword matching
        if let Some(_) = re.captures(&content) {
            mods.push(m);
            continue;
        }

        // Fuzzing matching (Needs improvements)
        let words = content.split_whitespace();
        for word in words {
            if !word.is_ascii() {
                continue;
            }
            let similarity = textdistance::nstr::sift4_simple(&query, word);
            if 1.0 - similarity >= 0.80 {
                mods.push(m);
                break;
            }
        }
    }

    *BUSY.lock().await = false;

    match sort.as_str() {
        "rating" => mods.sort_by(|a, b| b.rating_score.partial_cmp(&a.rating_score).unwrap()),
        "updated" => mods.sort_by(|a, b| b.date_updated.partial_cmp(&a.date_updated).unwrap()),
        "created" => mods.sort_by(|a, b| b.date_created.partial_cmp(&a.date_created).unwrap()),
        "downloads" => mods.sort_by(|a, b| b.versions[0].downloads.partial_cmp(&a.versions[0].downloads).unwrap()),
        "name" => mods.sort_by(|a, b| a.name.partial_cmp(&b.name).unwrap()),
        _ => {}
    }
    // fuzzy_mods.sort_by(|a, b| b.rating_score.partial_cmp(&a.rating_score).unwrap());
    // mods.append(&mut fuzzy_mods);

    // Only return 20 mods per page
    let page_mods = mods[page * 20..std::cmp::min(page * 20 + 20, mods.len())].to_vec();

    Ok(SearchResults {
        categories: package.categories.clone(),
        mods: page_mods.iter().map(|m| (*m).clone()).collect(),
        pages: mods.len() as u32 / 20,
    })
}
