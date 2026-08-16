@echo off
setlocal enabledelayedexpansion

:: Configuration
:: NEXUS_USERNAME and NEXUS_PASSWORD must be set in the environment before running this script.
:: Do not hardcode credentials here.
if not defined NEXUS_USERNAME (
    echo Error: NEXUS_USERNAME is not set.
    exit /b 1
)
if not defined NEXUS_PASSWORD (
    echo Error: NEXUS_PASSWORD is not set.
    exit /b 1
)
set NEXUS_URL=https://nexus.pituah.iaf/repository/npm/
set PACKAGE_DIR=.\@opentelemetry
set DRY_RUN=false

:: Create .npmrc file
echo //%NEXUS_URL%/:_authToken=%NEXUS_USERNAME%:%NEXUS_PASSWORD% > .npmrc
echo registry=%NEXUS_URL% >> .npmrc

:: Use PowerShell to find and publish all packages
powershell -Command "
    $packageDir = '%PACKAGE_DIR%'
    $dryRun = '%DRY_RUN%'
    $nexusUrl = '%NEXUS_URL%'

    # Function to publish a package
    function Publish-Package {
        param(
            [string]$path
        )

        $packageJson = Get-Content $path | ConvertFrom-Json

        if (-not $packageJson.name -or -not $packageJson.version) {
            Write-Host 'Error: Invalid package.json at ' $path
            return
        }

        Write-Host 'Publishing ' $packageJson.name '@' $packageJson.version ' from ' $path

        if ($dryRun -eq 'true') {
            Write-Host '  [DRY RUN] Would publish to ' $nexusUrl
            return
        }

        Push-Location (Split-Path $path)
        npm publish --registry $nexusUrl
        Pop-Location
    }

    # Publish root package
    $rootPackageJson = '$packageDir\package.json'
    if (Test-Path $rootPackageJson) {
        Publish-Package $rootPackageJson
    }

    # Publish all sub-packages
    Get-ChildItem -Path '$packageDir' -Directory -Recurse | ForEach-Object {
        $packageJsonPath = Join-Path $_.FullName 'package.json'
        if (Test-Path $packageJsonPath) {
            Publish-Package $packageJsonPath
        }
    }
"

echo Package publishing complete.
endlocal