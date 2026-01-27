use serde_json::json;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use crate::window_open_main;

fn load_image_from_path(path: &std::path::Path) -> Option<Image<'static>> {
    let img = image::open(path).ok()?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let pixels = rgba.into_raw();
    Some(Image::new_owned(pixels, width, height))
}

const MIC_MENU_ID: &str = "mic";
const OPEN_MENU_ID: &str = "open";
const QUIT_MENU_ID: &str = "quit";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id(MIC_MENU_ID, "Mic").build(app)?)
        .item(&MenuItemBuilder::with_id(OPEN_MENU_ID, "Open Winky").build(app)?)
        .item(&MenuItemBuilder::with_id(QUIT_MENU_ID, "Bye Winky").build(app)?)
        .build()?;

    // Загружаем иконку для tray
    // Сначала пробуем использовать встроенную иконку приложения
    let loaded_icon: Option<Image<'static>> = if let Some(default_icon) = app.default_window_icon() {
        // Используем встроенную иконку - конвертируем в owned
        // Получаем RGBA данные и размеры из Image
        let rgba_data = default_icon.rgba();
        let width = default_icon.width();
        let height = default_icon.height();
        Some(Image::new_owned(rgba_data.to_vec(), width, height))
    } else {
        // Если встроенной иконки нет, пробуем загрузить из файла
        // В режиме разработки используем путь относительно рабочей директории
        let mut found_icon = None;
        if let Ok(current_dir) = std::env::current_dir() {
            let dev_icon = current_dir.join("src-tauri").join("icons").join("icon.ico");
            if dev_icon.exists() {
                found_icon = load_image_from_path(&dev_icon);
            }
            if found_icon.is_none() {
                let dev_png = current_dir.join("src-tauri").join("icons").join("icon.png");
                if dev_png.exists() {
                    found_icon = load_image_from_path(&dev_png);
                }
            }
        }
        // Если не нашли в dev директории, пробуем загрузить из ресурсов приложения
        if found_icon.is_none() {
            found_icon = app.path()
                .resource_dir()
                .ok()
                .and_then(|dir| {
                    let icon_file = dir.join("icons").join("icon.ico");
                    if icon_file.exists() {
                        load_image_from_path(&icon_file)
                    } else {
                        let png_file = dir.join("icons").join("icon.png");
                        if png_file.exists() {
                            load_image_from_path(&png_file)
                        } else {
                            None
                        }
                    }
                });
        }
        found_icon
    };

    let mut builder = TrayIconBuilder::new();

    if let Some(icon) = loaded_icon {
        builder = builder.icon(icon);
    }

    builder
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { button, .. } = event {
                if button != MouseButton::Left {
                    return;
                }
                let app_handle = tray.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = window_open_main(app_handle).await {
                        eprintln!("Failed to open main window from tray double click: {}", e);
                    }
                });
            }
        })
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
