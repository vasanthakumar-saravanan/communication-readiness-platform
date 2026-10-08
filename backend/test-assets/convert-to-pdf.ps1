# PowerShell script to convert HTML to PDF using Chrome
$htmlFile = Join-Path $PSScriptRoot "beginner-student-resume.html"
$pdfFile = Join-Path $PSScriptRoot "beginner-student-resume.pdf"

# Check for Chrome installation
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

# Check for Edge as fallback
if (-not $chromePath) {
    $edgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (Test-Path $edgePath) {
        $chromePath = $edgePath
    }
}

if ($chromePath) {
    Write-Host "Converting HTML to PDF using: $chromePath"
    & $chromePath --headless --disable-gpu --print-to-pdf="$pdfFile" "$htmlFile"
    Write-Host "PDF created: $pdfFile"
} else {
    Write-Host "Error: Chrome or Edge not found. Please install Chrome or use a browser to manually convert."
    Write-Host "Manual steps:"
    Write-Host "1. Open $htmlFile in a browser"
    Write-Host "2. Press Ctrl+P"
    Write-Host "3. Select 'Save as PDF'"
    Write-Host "4. Save as: $pdfFile"
}
