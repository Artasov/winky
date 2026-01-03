!macro customInstall
  ; Регистрируем протокол winky:// в пользовательском реестре
  ; Это нужно для OAuth callback через deep link
  WriteRegStr HKCU "Software\Classes\winky" "" "URL:Winky Protocol"
  WriteRegStr HKCU "Software\Classes\winky" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\winky\DefaultIcon" "" "$INSTDIR\Winky.exe,0"
  WriteRegStr HKCU "Software\Classes\winky\shell\open\command" "" '"$INSTDIR\Winky.exe" "%1"'
!macroend

!macro customUnInstall
  ; Удаляем регистрацию протокола при деинсталляции
  DeleteRegKey HKCU "Software\Classes\winky"
!macroend



