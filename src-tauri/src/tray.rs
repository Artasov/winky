use serde_json::json;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

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
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
                let _ = app.emit("tray:open-main", ());
            }
            QUIT_MENU_ID => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}
