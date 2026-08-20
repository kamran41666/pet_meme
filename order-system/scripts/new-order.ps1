param(
    [string]$OrderId,
    [Parameter(Mandatory = $true)]
    [string]$PetName,
    [Parameter(Mandatory = $true)]
    [ValidateSet("cat", "dog")]
    [string]$PetType,
    [switch]$OwnSample
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$OrdersRoot = Join-Path $ProjectRoot "orders"

if (-not $OrderId) {
    $DatePart = Get-Date -Format "yyyyMMdd"
    $Prefix = "PS-$DatePart-"
    $Existing = @(
        Get-ChildItem -LiteralPath $OrdersRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name.StartsWith($Prefix) } |
            ForEach-Object {
                $Suffix = $_.Name.Substring($Prefix.Length)
                if ($Suffix -match '^\d{3}$') { [int]$Suffix }
            }
    )
    $NextNumber = if ($Existing.Count -eq 0) { 1 } else { ($Existing | Measure-Object -Maximum).Maximum + 1 }
    $OrderId = "{0}{1:D3}" -f $Prefix, $NextNumber
}

if ($OrderId -notmatch '^PS-\d{8}-\d{3}$') {
    throw "订单编号必须符合 PS-YYYYMMDD-NNN，例如 PS-20260820-001。"
}

$OrderDir = Join-Path $OrdersRoot $OrderId
if (Test-Path -LiteralPath $OrderDir) {
    throw "订单目录已存在，拒绝覆盖：$OrderDir"
}

$Subdirectories = @("input", "identity", "anchor", "pilots", "no-caption", "final", "preview", "qa")
New-Item -ItemType Directory -Path $OrderDir | Out-Null
foreach ($Name in $Subdirectories) {
    New-Item -ItemType Directory -Path (Join-Path $OrderDir $Name) | Out-Null
}

$Order = [ordered]@{
    order_id = $OrderId
    pet_name = $PetName
    pet_type = $PetType
    reference_photos = @()
    must_keep_features = @()
    must_not_include = @()
    case_display_authorization = $false
    photo_rights_confirmation = $false
    output_directory = "orders/$OrderId"
    auto_approve_sample = [bool]$OwnSample
    style_profile_id = "launch-warm-rounded-v1"
}

$OrderJson = $Order | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $OrderDir "order.json"), $OrderJson, [System.Text.UTF8Encoding]::new($false))

$RequestText = @"
# 客户需求记录

- 订单编号：$OrderId
- 宠物名字：$PetName
- 宠物类型：$PetType
- 客户昵称：
- 联系方式：
- 必须保留的特征：
- 禁止出现的元素：
- 照片权利确认：未确认
- 案例公开授权：不同意
- 客户原始备注：
"@
[System.IO.File]::WriteAllText((Join-Path $OrderDir "customer-request.md"), $RequestText, [System.Text.UTF8Encoding]::new($false))

$StatusText = @"
# 订单状态记录

| 时间 | 状态 | 操作人 | 说明 | 下一步 |
|---|---|---|---|---|
| $(Get-Date -Format "yyyy-MM-dd HH:mm") | 待提交资料 | 运营 | 已创建订单目录 | 收集照片与授权确认 |
"@
[System.IO.File]::WriteAllText((Join-Path $OrderDir "status-log.md"), $StatusText, [System.Text.UTF8Encoding]::new($false))

Write-Output "订单已创建：$OrderDir"
Write-Output "下一步：把 5–8 张照片放入 input 文件夹，更新 order.json，并在订单总表新增一行。"
