$ErrorActionPreference = "Stop"
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = if ($args.Count -gt 0) { $args[0] } else { "192.168.100.91:5555" }
$hostIp = if ($args.Count -gt 1) { $args[1] } else { "192.168.100.158" }

$xml = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="api_host">$hostIp</string>
</map>
"@
$xml = $xml.Replace("`r", "")
$tmp = Join-Path $env:TEMP "don_nicolas_api.xml"
[System.IO.File]::WriteAllText($tmp, $xml)

Write-Host "==> Writing prefs via tee ($hostIp)"
# stdin -> run-as tee (cwd = app data). Avoid sh -c redirects (cwd becomes /).
Get-Content -Raw $tmp | & $adb -s $serial shell "run-as com.donnicolas.rfid tee shared_prefs/don_nicolas_api.xml" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "tee failed" }

Write-Host "==> Prefs:"
& $adb -s $serial shell "run-as com.donnicolas.rfid cat shared_prefs/don_nicolas_api.xml"

Write-Host "==> Restart app"
& $adb -s $serial shell "am force-stop com.donnicolas.rfid"
Start-Sleep -Seconds 1
& $adb -s $serial shell "monkey -p com.donnicolas.rfid -c android.intent.category.LAUNCHER 1" | Out-Null

Write-Host "==> Health LAN"
& $adb -s $serial shell "curl -sf --connect-timeout 5 http://${hostIp}:8000/api/v1/health"
Write-Host ""
Write-Host "OK: login Servidor = $hostIp"
