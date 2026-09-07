[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$UpdateUrl,

    [switch]$Machine
)

$hive = if ($Machine) { 'HKLM:' } else { 'HKCU:' }
$policyPath = Join-Path $hive 'Software\Policies\Google\Chrome'
New-Item -Path $policyPath -Force | Out-Null

$settings = @{}
$existing = Get-ItemProperty -Path $policyPath -Name ExtensionSettings -ErrorAction SilentlyContinue
if ($null -ne $existing -and $existing.ExtensionSettings) {
    try {
        $parsed = $existing.ExtensionSettings | ConvertFrom-Json
        if ($null -ne $parsed) {
            foreach ($property in $parsed.PSObject.Properties) {
                $settings[$property.Name] = $property.Value
            }
        }
    } catch {
        Write-Warning 'Existing ExtensionSettings was not valid JSON; replacing only that policy value.'
    }
}

$settings[$ExtensionId] = @{
    installation_mode = 'force_installed'
    update_url = $UpdateUrl
    override_update_url = $true
}
$json = $settings | ConvertTo-Json -Compress -Depth 10
New-ItemProperty -Path $policyPath -Name ExtensionSettings -PropertyType String -Value $json -Force | Out-Null

Write-Host "Installed Pony Browser MCP Chrome policy under $policyPath"
Write-Host 'Restart Chrome to apply the policy.'
