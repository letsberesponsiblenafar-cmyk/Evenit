Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'ios\App\App\Assets.xcassets'

function New-EvenitArtwork {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][double]$MarkScale
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#54259A'))

    $pathData = New-Object System.Drawing.Drawing2D.GraphicsPath
    $unit = ($Size / 108.0) * $MarkScale
    $offset = ($Size - (108 * $unit)) / 2.0
    function Point([double]$x, [double]$y) {
        New-Object System.Drawing.PointF(($offset + $x * $unit), ($offset + $y * $unit))
    }

    $pathData.StartFigure()
    $pathData.AddBezier((Point 54 28), (Point 34 28), (Point 21 42), (Point 21 58))
    $pathData.AddBezier((Point 21 58), (Point 21 75), (Point 34 87), (Point 54 87))
    $pathData.AddBezier((Point 54 87), (Point 67 87), (Point 78 81), (Point 85 70))
    $pathData.AddLine((Point 85 70), (Point 74 64))
    $pathData.AddBezier((Point 74 64), (Point 69 71), (Point 63 75), (Point 54 75))
    $pathData.AddBezier((Point 54 75), (Point 43 75), (Point 35 69), (Point 34 60))
    $pathData.AddLine((Point 34 60), (Point 87 60))
    $pathData.AddBezier((Point 87 60), (Point 88 42), (Point 75 28), (Point 54 28))
    $pathData.CloseFigure()
    $pathData.StartFigure()
    $pathData.AddBezier((Point 34 50), (Point 37 42), (Point 44 38), (Point 54 38))
    $pathData.AddBezier((Point 54 38), (Point 65 38), (Point 72 43), (Point 75 50))
    $pathData.AddLine((Point 75 50), (Point 34 50))
    $pathData.CloseFigure()

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.FillPath($brush, $pathData)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $brush.Dispose()
    $pathData.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$icon = Join-Path $assetRoot 'AppIcon.appiconset\AppIcon-512@2x.png'
New-EvenitArtwork -Path $icon -Size 1024 -MarkScale 0.78

$splashRoot = Join-Path $assetRoot 'Splash.imageset'
@('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png') | ForEach-Object {
    New-EvenitArtwork -Path (Join-Path $splashRoot $_) -Size 2732 -MarkScale 0.30
}
