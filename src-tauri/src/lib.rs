mod commands;
mod error;
mod models;
mod project_store;
mod signing;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::healthcheck,
            commands::create_keystore,
            commands::inspect_keystore,
            commands::sign_apk,
            commands::verify_apk,
            commands::sign_jar_or_bundle,
            commands::save_secret,
            commands::load_secret,
            commands::delete_secret,
            commands::list_projects,
            commands::upsert_project,
            commands::delete_project,
            commands::rotate_keystore_password,
            commands::export_certificate,
            commands::discover_artifacts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
