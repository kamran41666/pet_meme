param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(0, 8192)]
    [int]$Size = 0
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -eq 'Core') {
    $windowsPowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -InputPath $InputPath -OutputPath $OutputPath -Size $Size
    exit $LASTEXITCODE
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not [System.IO.Directory]::Exists($outputDirectory)) {
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

Add-Type -AssemblyName System.Drawing

if (-not ('PetStickerStudio.ChromaKey' -as [type])) {
    Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace PetStickerStudio
{
    public static class ChromaKey
    {
        public static void RemoveBlue(string inputPath, string outputPath, int targetSize)
        {
            using (var source = new Bitmap(inputPath))
            using (var cutout = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
            {
                // Generative models often turn a requested solid chroma screen into a
                // subtly shaded one. Estimate the actual screen from the four corners
                // instead of assuming exact #0000ff.
                Color[] corners = new Color[]
                {
                    source.GetPixel(0, 0),
                    source.GetPixel(source.Width - 1, 0),
                    source.GetPixel(0, source.Height - 1),
                    source.GetPixel(source.Width - 1, source.Height - 1)
                };
                double screenBlue = 0;
                double screenDominance = 0;
                foreach (Color corner in corners)
                {
                    screenBlue += corner.B;
                    screenDominance += corner.B - Math.Max(corner.R, corner.G);
                }
                screenBlue /= corners.Length;
                screenDominance /= corners.Length;

                if (screenBlue < 100 || screenDominance < 40)
                {
                    throw new InvalidOperationException(
                        "The image corners do not look like a blue chroma background."
                    );
                }

                int hardDominance = Math.Max(40, (int)Math.Round(screenDominance * 0.42));
                int softDominance = Math.Max(8, (int)Math.Round(hardDominance * 0.22));
                int minimumBlue = Math.Max(45, (int)Math.Round(screenBlue * 0.42));

                for (int y = 0; y < source.Height; y++)
                {
                    for (int x = 0; x < source.Width; x++)
                    {
                        Color c = source.GetPixel(x, y);
                        int dominance = c.B - Math.Max(c.R, c.G);
                        int alpha = 255;
                        int red = c.R;
                        int green = c.G;
                        int blue = c.B;

                        if (c.B >= minimumBlue && dominance >= hardDominance)
                        {
                            alpha = 0;
                        }
                        else if (c.B >= minimumBlue && dominance > softDominance)
                        {
                            alpha = (int)Math.Round(
                                255.0 * (hardDominance - dominance) /
                                (hardDominance - softDominance)
                            );
                            alpha = Math.Max(0, Math.Min(255, alpha));
                            // Despill the semi-transparent edge so it stays neutral on
                            // light and dark chat backgrounds.
                            blue = Math.Min(blue, Math.Max(red, green) + 6);
                        }

                        cutout.SetPixel(x, y, Color.FromArgb(alpha, red, green, blue));
                    }
                }

                if (targetSize > 0 && (cutout.Width != targetSize || cutout.Height != targetSize))
                {
                    using (var resized = new Bitmap(targetSize, targetSize, PixelFormat.Format32bppArgb))
                    {
                        using (var graphics = Graphics.FromImage(resized))
                        {
                            graphics.CompositingMode = CompositingMode.SourceCopy;
                            graphics.CompositingQuality = CompositingQuality.HighQuality;
                            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            graphics.SmoothingMode = SmoothingMode.HighQuality;
                            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                            graphics.DrawImage(cutout, new Rectangle(0, 0, targetSize, targetSize));
                        }
                        resized.Save(outputPath, ImageFormat.Png);
                    }
                }
                else
                {
                    cutout.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }
}
'@
}

[PetStickerStudio.ChromaKey]::RemoveBlue($resolvedInput, $resolvedOutput, $Size)
Write-Output $resolvedOutput
