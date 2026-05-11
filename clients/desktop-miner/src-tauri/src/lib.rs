//! Tauri 2 entry point for the Equium desktop miner.
//! Owns the encrypted keystore, RPC config, and mining loop. Exposes commands
//! the frontend invokes via `@tauri-apps/api`.

mod keystore;
mod miner;
mod sender;
mod settings;
mod state;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data).ok();
            let state = AppState::new(app_data);
            app.manage(Arc::new(Mutex::new(state)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Keystore
            keystore::wallet_status,
            keystore::create_wallet,
            keystore::import_wallet,
            keystore::unlock_wallet,
            keystore::lock_wallet,
            keystore::forget_wallet,
            keystore::export_secret,
            // Settings
            settings::get_settings,
            settings::set_rpc_url,
            settings::get_program_state,
            settings::get_wallet_balances,
            // Mining
            miner::start_mining,
            miner::stop_mining,
            miner::miner_status,
            // Sending
            sender::send_sol,
            sender::send_eqm,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
