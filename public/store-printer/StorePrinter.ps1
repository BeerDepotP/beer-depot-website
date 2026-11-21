# Beer Depot store tag printer. Runs quietly on the store Windows computer.
# It checks the website every few seconds for price tags sent with "Print at Store" and prints them on ONE printer
# that you choose by name (never the computer's default printer).
#   StorePrinter.ps1 -Setup   choose the label printer, sign in, print a test tag, start with Windows
#   StorePrinter.ps1 -Test    print one test tag
#   StorePrinter.ps1          run (this is what starts with Windows)
param([switch]$Setup, [switch]$Test)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $env:APPDATA 'BeerDepotStorePrinter'
New-Item -ItemType Directory -Force $dir | Out-Null
$cfgFile = Join-Path $dir 'config.json'
$logFile = Join-Path $dir 'log.txt'
$script:Url = 'https://beerdepotpewaukee.com/api/office'

function Log($m) {
  try { if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 200KB) { Remove-Item $logFile -Force }
        Add-Content -Path $logFile -Value ("{0} {1}" -f (Get-Date -Format 's'), $m) } catch { }
}
function Load-Cfg {
  if (-not (Test-Path $cfgFile)) { return $null }
  try { return (Get-Content $cfgFile -Raw | ConvertFrom-Json) } catch { return $null }
}
function Get-Pin($cfg) {
  $sec = ConvertTo-SecureString $cfg.pin
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Call($pin, $body) {
  $body['pin'] = $pin
  $json = ConvertTo-Json $body -Depth 8 -Compress
  return Invoke-RestMethod -Uri $script:Url -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30
}
function Printer-Exists($name) {
  return ([System.Drawing.Printing.PrinterSettings]::InstalledPrinters -contains $name)
}

# ---------- barcode (UPC-A / EAN-13 / EAN-8) ----------
$script:L = @('0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011')
$script:PAR = @('LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL')
function Rev($s) { $a = $s.ToCharArray(); [Array]::Reverse($a); return (-join $a) }
function Inv($s) { return (-join ($s.ToCharArray() | ForEach-Object { if ($_ -eq '1') { '0' } else { '1' } })) }
function Bar-Bits($code) {
  if ($code -match '^\d{12,13}$') {
    $c = $code; if ($c.Length -eq 12) { $c = '0' + $c }
    $par = $script:PAR[[int]::Parse($c.Substring(0,1))]
    $bits = '101'
    for ($i = 0; $i -lt 6; $i++) { $d = [int]::Parse($c.Substring($i + 1, 1)); if ($par[$i] -eq 'L') { $bits += $script:L[$d] } else { $bits += (Rev $script:L[$d]) } }
    $bits += '01010'
    for ($i = 7; $i -lt 13; $i++) { $d = [int]::Parse($c.Substring($i, 1)); $bits += (Inv $script:L[$d]) }
    return $bits + '101'
  }
  if ($code -match '^\d{8}$') {
    $bits = '101'
    for ($i = 0; $i -lt 4; $i++) { $bits += $script:L[[int]::Parse($code.Substring($i, 1))] }
    $bits += '01010'
    for ($i = 4; $i -lt 8; $i++) { $bits += (Inv $script:L[[int]::Parse($code.Substring($i, 1))]) }
    return $bits + '101'
  }
  return ''
}

# ---------- one tag ----------
function Draw-Tag($g, $t, $w, $h) {
  $K = [Math]::Min($w / 2.25, $h / 1.25)
  $W = $w * 100; $H = $h * 100
  $g.Clear([System.Drawing.Color]::White)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $pt = [System.Drawing.GraphicsUnit]::Point
  $bold = [System.Drawing.FontStyle]::Bold
  $black = [System.Drawing.Brushes]::Black
  $x = 8 * $K; $inner = $W - 16 * $K
  $name = [string]$t.name; if ($t.label) { $name = $name + '  ' + $t.label }
  $sf = New-Object System.Drawing.StringFormat
  $nameW = $inner - 52 * $K; $nameH = 28 * $K; $size = 9.5 * $K
  $fn = New-Object System.Drawing.Font('Arial', $size, $bold, $pt)
  while ($size -gt 4 -and $g.MeasureString($name, $fn, [int]$nameW, $sf).Height -gt $nameH) { $fn.Dispose(); $size = $size - 0.25; $fn = New-Object System.Drawing.Font('Arial', $size, $bold, $pt) }
  $g.DrawString($name, $fn, $black, (New-Object System.Drawing.RectangleF($x, (4 * $K), $nameW, $nameH)), $sf)
  $fc = New-Object System.Drawing.Font('Arial', (30 * $K), $bold, $pt)
  $g.DrawString([string]$t.cash, $fc, $black, $x, (32 * $K))
  $fr = New-Object System.Drawing.Font('Arial', (9 * $K), $bold, $pt)
  if ($t.credit) { $g.DrawString(('Credit ' + [string]$t.credit), $fr, $black, $x, (78 * $K)) }
  if ($t.dist) { $fd = New-Object System.Drawing.Font('Arial', (7 * $K), $bold, $pt); $g.DrawString([string]$t.dist, $fd, $black, ($W - 8 * $K - $g.MeasureString([string]$t.dist, $fd).Width), (82 * $K)); $fd.Dispose() }
  $bits = ''; if ($t.bar -and $t.code) { $bits = Bar-Bits ([string]$t.code) }
  $fs = New-Object System.Drawing.Font('Arial', (6.5 * $K), [System.Drawing.FontStyle]::Regular, $pt)
  if ($bits) {
    $q = 10; $n = $bits.Length + 2 * $q; $mw = $inner / $n; $top = 92 * $K; $bh = 18 * $K; $i = 0
    while ($i -lt $bits.Length) {
      if ($bits[$i] -eq '1') { $j = $i; while ($j -lt $bits.Length -and $bits[$j] -eq '1') { $j++ }
        $g.FillRectangle($black, [single]($x + ($q + $i) * $mw), [single]$top, [single](($j - $i) * $mw), [single]$bh); $i = $j } else { $i++ }
    }
    $g.DrawString([string]$t.code, $fs, $black, $x, (111 * $K))
  } elseif ($t.code) {
    $g.DrawString([string]$t.code, $fs, $black, $x, (100 * $K))
  }
  $fn.Dispose(); $fc.Dispose(); $fr.Dispose(); $fs.Dispose(); $sf.Dispose()
}

function Print-Tags($tags, $w, $h, $printer) {
  if (-not (Printer-Exists $printer)) { throw ('The printer "' + $printer + '" was not found on this computer.') }
  $script:tagList = @($tags); $script:tagIdx = 0; $script:tagW = [double]$w; $script:tagH = [double]$h
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $printer
  if (-not $pd.PrinterSettings.IsValid) { throw ('The printer "' + $printer + '" is not ready.') }
  $pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Tag', [int]($w * 100), [int]($h * 100))
  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $pd.add_PrintPage({ param($sender, $e)
    Draw-Tag $e.Graphics $script:tagList[$script:tagIdx] $script:tagW $script:tagH
    $script:tagIdx++
    $e.HasMorePages = ($script:tagIdx -lt $script:tagList.Count)
  })
  $pd.Print()
  $pd.Dispose()
}

$testTag = [pscustomobject]@{ name = 'TEST TAG - BEER DEPOT'; cash = '$9.99'; credit = ''; dist = 'Test Distributor'; code = '012345678905'; label = ''; bar = $true }

# ---------- setup ----------
if ($Setup) {
  Clear-Host
  Write-Host 'Beer Depot store tag printer - setup' -ForegroundColor Yellow
  Write-Host ''
  $sec = Read-Host 'Type your Back Office PIN (you will not see it) and press Enter' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $pin = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  try { $r = Call $pin @{ action = 'ping' }; if (-not $r.ok) { throw 'No' } } catch { Write-Host 'That PIN was not accepted or the website could not be reached. Try again.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
  $all = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)
  Write-Host ''; Write-Host 'Printers on this computer:'
  for ($i = 0; $i -lt $all.Count; $i++) { Write-Host ('  {0}) {1}' -f ($i + 1), $all[$i]) }
  Write-Host ''
  $pick = Read-Host 'Type the number of your LABEL printer (the tag printer) and press Enter'
  $idx = 0; if (-not [int]::TryParse($pick, [ref]$idx) -or $idx -lt 1 -or $idx -gt $all.Count) { Write-Host 'That was not one of the numbers.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
  $printer = $all[$idx - 1]
  $enc = ConvertFrom-SecureString (ConvertTo-SecureString $pin -AsPlainText -Force)
  ([pscustomobject]@{ pin = $enc; printer = $printer } | ConvertTo-Json) | Set-Content -Path $cfgFile -Encoding UTF8
  Write-Host ''; Write-Host ('Chosen: ' + $printer) -ForegroundColor Green
  Write-Host 'Printing one test tag...'
  try { Print-Tags @($testTag) 2.25 1.25 $printer; Write-Host 'Sent. Check that it came out of the label printer.' -ForegroundColor Green } catch { Write-Host ('The test tag did not print: ' + $_.Exception.Message) -ForegroundColor Red }
  # start with Windows (Startup folder, no admin needed)
  try {
    $startup = [Environment]::GetFolderPath('Startup'); $lnk = Join-Path $startup 'Beer Depot Store Printer.lnk'
    $ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = 'powershell.exe'; $sc.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    $sc.WorkingDirectory = $dir; $sc.WindowStyle = 7; $sc.Save()
    Write-Host 'It will now start by itself when Windows starts.' -ForegroundColor Green
  } catch { Write-Host ('Could not set it to start with Windows: ' + $_.Exception.Message) -ForegroundColor Red }
  Start-Process powershell.exe -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
  Write-Host ''; Write-Host 'Done. It is running in the background now. You can close this window.' -ForegroundColor Yellow
  Read-Host 'Press Enter to close'
  exit 0
}

$cfg = Load-Cfg
if (-not $cfg -or -not $cfg.printer) { Write-Host 'Not set up yet. Run Install-Store-Printer.bat first.'; exit 1 }
if ($Test) { try { Print-Tags @($testTag) 2.25 1.25 $cfg.printer; Write-Host 'Test tag sent.' } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; exit 0 }

# ---------- run ----------
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\BeerDepotStorePrinter', [ref]$created)
if (-not $created) { exit 0 }
$pin = Get-Pin $cfg
Log ('Started. Printer: ' + $cfg.printer)
$wait = 5
while ($true) {
  try {
    $found = Printer-Exists $cfg.printer
    $r = Call $pin @{ action = 'print-poll'; printer = [string]$cfg.printer; found = $found; name = $env:COMPUTERNAME }
    $wait = 5
    foreach ($j in @($r.jobs)) {
      if (-not $j) { continue }
      try {
        Print-Tags @($j.tags) $j.w $j.h $cfg.printer
        Call $pin @{ action = 'print-done'; id = $j.id; ok = $true } | Out-Null
        Log ('Printed ' + @($j.tags).Count + ' tags (job ' + $j.id + ')')
      } catch {
        Log ('Print failed: ' + $_.Exception.Message)
        try { Call $pin @{ action = 'print-done'; id = $j.id; ok = $false; error = $_.Exception.Message } | Out-Null } catch { }
      }
    }
  } catch { Log ('Could not reach the website: ' + $_.Exception.Message); $wait = 20 }
  Start-Sleep -Seconds $wait
}
