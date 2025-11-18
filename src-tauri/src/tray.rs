use serde_json::json;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use crate::window_open_main;

const MIC_MENU_ID: &str = "mic";
const OPEN_MENU_ID: &str = "open";
const QUIT_MENU_ID: &str = "quit";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id(MIC_MENU_ID, "Mic").build(app)?)
        .item(&MenuItemBuilder::with_id(OPEN_MENU_ID, "Open Winky").build(app)?)
        .item(&MenuItemBuilder::with_id(QUIT_MENU_ID, "Bye Winky").build(app)?)
        .build()?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MIC_MENU_ID => {
                let _ = app.emit("mic:show-request", json!({ "reason": "taskbar" }));
            }
            OPEN_MENU_ID => {
                // Используем команду для открытия главного окна (создает окно заново если его нет)
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = window_open_main(app_handle).await {
                        eprintln!("Failed to open main window from tray: {}", e);
                    }
                });
            }
            QUIT_MENU_ID => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}
