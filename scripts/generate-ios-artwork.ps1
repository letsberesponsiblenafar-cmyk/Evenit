Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$fontPath = Join-Path $projectRoot 'assets\fonts\abask-regular.ttf'
$privateFonts = New-Object System.Drawing.Text.PrivateFontCollection
$privateFonts.AddFontFile($fontPath)
$brandFamily = $privateFonts.Families[0]
$purple = [System.Drawing.ColorTranslator]::FromHtml('#54259A')
$cream = [System.Drawing.ColorTranslator]::FromHtml('#F7F4FB')
$white = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')

function New-BrandArtwork {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][double]$FontScale,
        [System.Drawing.Color]$BackgroundColor = $purple,
        [System.Drawing.Color]$ForegroundColor = $cream,
        [switch]$Transparent,
        [switch]$RoundBackground,
        [switch]$Thicken
    )

    $pixelFormat = if ($Transparent) {
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    } else {
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    }
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, $pixelFormat)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    if ($Transparent) {
        $graphics.Clear([System.Drawing.Color]::Transparent)
    } else {
        $graphics.Clear($BackgroundColor)
    }
    if ($RoundBackground) {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $backgroundBrush = New-Object System.Drawing.SolidBrush($BackgroundColor)
        $graphics.FillEllipse($backgroundBrush, 0, 0, $Width, $Height)
        $backgroundBrush.Dispose()
    }

    $fontSize = [single]([Math]::Min($Width, $Height) * $FontScale)
    $font = New-Object System.Drawing.Font($brandFamily, $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush($ForegroundColor)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
    $verticalAdjustment = if ($Text -eq 'evenit') { -0.035 * $Height } else { -0.025 * $Height }
    $rect = New-Object System.Drawing.RectangleF(0, $verticalAdjustment, $Width, $Height)
    if ($Thicken) {
        $shift = [single]([Math]::Max(1, [Math]::Min($Width, $Height) * 0.012))
        $leftRect = New-Object System.Drawing.RectangleF(-$shift, $verticalAdjustment, $Width, $Height)
        $rightRect = New-Object System.Drawing.RectangleF($shift, $verticalAdjustment, $Width, $Height)
        $graphics.DrawString($Text, $font, $brush, $leftRect, $format)
        $graphics.DrawString($Text, $font, $brush, $rightRect, $format)
    }
    $graphics.DrawString($Text, $font, $brush, $rect, $format)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

function New-IconSet {
    $webRoot = Join-Path $projectRoot 'assets\brand'
    New-Item -ItemType Directory -Force -Path $webRoot | Out-Null
    New-BrandArtwork -Path (Join-Path $webRoot 'favicon-32.png') -Width 32 -Height 32 -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    New-BrandArtwork -Path (Join-Path $webRoot 'favicon-192.png') -Width 192 -Height 192 -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    New-BrandArtwork -Path (Join-Path $webRoot 'favicon-512.png') -Width 512 -Height 512 -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    New-BrandArtwork -Path (Join-Path $webRoot 'apple-touch-icon.png') -Width 180 -Height 180 -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    New-BrandArtwork -Path (Join-Path $webRoot 'evenit-wordmark.png') -Width 1200 -Height 360 -Text 'evenit' -FontScale 0.40
}

function New-IosArtwork {
    $assetRoot = Join-Path $projectRoot 'ios\App\App\Assets.xcassets'
    New-BrandArtwork -Path (Join-Path $assetRoot 'AppIcon.appiconset\AppIcon-512@2x.png') -Width 1024 -Height 1024 -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    $splashRoot = Join-Path $assetRoot 'Splash.imageset'
    @('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png') | ForEach-Object {
        New-BrandArtwork -Path (Join-Path $splashRoot $_) -Width 2732 -Height 2732 -Text 'evenit' -FontScale 0.18
    }
}

function New-AndroidArtwork {
    $resourceRoot = Join-Path $projectRoot 'android\app\src\main\res'
    Get-ChildItem $resourceRoot -Recurse -File -Filter 'splash.png' | ForEach-Object {
        $existing = [System.Drawing.Image]::FromFile($_.FullName)
        $width = $existing.Width
        $height = $existing.Height
        $existing.Dispose()
        New-BrandArtwork -Path $_.FullName -Width $width -Height $height -Text 'evenit' -FontScale 0.22
    }

    Get-ChildItem $resourceRoot -Recurse -File -Filter 'ic_launcher.png' | ForEach-Object {
        $existing = [System.Drawing.Image]::FromFile($_.FullName)
        $size = $existing.Width
        $existing.Dispose()
        New-BrandArtwork -Path $_.FullName -Width $size -Height $size -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -Thicken
    }
    Get-ChildItem $resourceRoot -Recurse -File -Filter 'ic_launcher_round.png' | ForEach-Object {
        $existing = [System.Drawing.Image]::FromFile($_.FullName)
        $size = $existing.Width
        $existing.Dispose()
        New-BrandArtwork -Path $_.FullName -Width $size -Height $size -Text 'e' -FontScale 0.82 -BackgroundColor $white -ForegroundColor $purple -RoundBackground -Thicken
    }
    Get-ChildItem $resourceRoot -Recurse -File -Filter 'ic_launcher_foreground.png' | ForEach-Object {
        $existing = [System.Drawing.Image]::FromFile($_.FullName)
        $size = $existing.Width
        $existing.Dispose()
        New-BrandArtwork -Path $_.FullName -Width $size -Height $size -Text 'e' -FontScale 0.58 -ForegroundColor $purple -Transparent -Thicken
    }
}

New-IconSet
New-IosArtwork
New-AndroidArtwork
$privateFonts.Dispose()
