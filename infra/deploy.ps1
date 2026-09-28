#Requires -Version 5.1
<#
.SYNOPSIS
    Creates or updates one customer's storefront on Cloudflare Pages, then builds
    this folder with that customer's settings and publishes it.

.DESCRIPTION
    One command per customer, from the frontend folder:

        .\infra\deploy.ps1 <customer>

    It reads infra\customers\<customer>.env and, in order:
      1. checks the Cloudflare API token can manage Pages in that account
      2. signs in to the customer's Google Cloud project, where Terraform keeps
         its notes (the state bucket the backend deploy created)
      3. runs Terraform (infra\stack): the Pages project, and the customer's own
         domain with its DNS record when one is set
      4. builds the site with that customer's settings - every VITE_ value comes
         from the customer file, never from this folder's .env
      5. uploads it with wrangler; the upload is the live site straight away
      6. checks the site answers

    Safe to re-run at any time: Terraform only changes what differs, and every
    upload is a new version you can roll back to in the Cloudflare dashboard.

.PARAMETER Customer
    The customer file's name without .env, e.g. sritharcrackers.

.PARAMETER CodeOnly
    Build and upload only (steps 1, 4-6). The everyday way to ship a change.

.PARAMETER SkipCode
    Stop after Terraform; build and upload nothing.

.PARAMETER PlanOnly
    Show what Terraform would change, and stop. Nothing is changed.

.PARAMETER AutoApprove
    Apply the Terraform plan without asking. A person should normally read it.

.EXAMPLE
    .\infra\deploy.ps1 sritharcrackers
    .\infra\deploy.ps1 sritharcrackers -CodeOnly

.NOTES
    If Windows says running scripts is disabled, run it as:
        powershell -ExecutionPolicy Bypass -File .\infra\deploy.ps1 <customer>

    $ErrorActionPreference is 'Continue', not 'Stop': gcloud and npm print
    ordinary progress on stderr, which Windows PowerShell 5.1 turns into errors
    that 'Stop' would abort on. Every native call checks $LASTEXITCODE instead.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Customer,

    [switch]$CodeOnly,
    [switch]$SkipCode,
    [switch]$PlanOnly,
    [switch]$AutoApprove
)

$ErrorActionPreference = 'Continue'

# Every setting the build reads (src/ and vite.config.ts). Each one is set for
# the build from the customer file - blank when the file leaves it out - so the
# developer's own .env in this folder can never leak into a customer's site.
$ViteKeys = @(
    'VITE_API_URL', 'VITE_SITE_URL', 'VITE_SITE_NAME', 'VITE_SITE_TAGLINE', 'VITE_SITE_DESCRIPTION',
    'VITE_SITE_LOGO', 'VITE_THEME_COLOR', 'VITE_SITE_LOCALITY', 'VITE_SITE_REGION', 'VITE_SITE_REGION_CODE',
    'VITE_RAZORPAY_KEY_ID',
    'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID'
)

$InfraRoot = $PSScriptRoot
$SiteRoot = Split-Path $InfraRoot -Parent
$CustomerDir = Join-Path $InfraRoot 'customers'
$StackDir = Join-Path $InfraRoot 'stack'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$CloudflareApi = 'https://api.cloudflare.com/client/v4'

# --- Output ------------------------------------------------------------------

function Fail([string]$Message) {
    Write-Host ''
    Write-Host "  ERROR  $Message" -ForegroundColor Red
    Write-Host ''
    # Caught at the bottom, so the environment is always put back.
    throw 'DeployFailed'
}

function Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Note([string]$Message) { Write-Host "    $Message" -ForegroundColor DarkGray }
function Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Warn([string]$Message) { Write-Host "    !   $Message" -ForegroundColor Yellow }

# KEY=VALUE lines as dotenv reads them: '#' comment lines, optional quotes, a
# quoted value may run over several lines, and an unquoted value ends at ' #'.
function Read-DotEnv([string]$Path) {
    $result = [ordered]@{}
    $lines = [System.IO.File]::ReadAllLines($Path)
    $i = 0
    while ($i -lt $lines.Count) {
        $line = $lines[$i].Trim()
        $i++
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line.StartsWith('export ')) { $line = $line.Substring(7).TrimStart() }

        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()

        if ($value.Length -gt 0 -and ($value[0] -eq '"' -or $value[0] -eq "'")) {
            $quote = $value[0]
            $body = $value.Substring(1)
            while ($body.IndexOf($quote) -lt 0 -and $i -lt $lines.Count) {
                $body += "`n" + $lines[$i]
                $i++
            }
            $close = $body.IndexOf($quote)
            if ($close -lt 0) { Fail "${Path}: the value of $key opens a quote that never closes." }
            $value = $body.Substring(0, $close)
        }
        else {
            $comment = $value.IndexOf(' #')
            if ($comment -ge 0) { $value = $value.Substring(0, $comment).TrimEnd() }
        }

        $result[$key] = $value
    }
    return $result
}

# A Cloudflare API call as the customer's token. $null on a 404.
function Invoke-Cloudflare([string]$Path) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
        return Invoke-RestMethod -Uri "$CloudflareApi$Path" -Headers @{ Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN" } -TimeoutSec 30
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 404) { return $null }
        Fail "Cloudflare refused $Path (HTTP $status). Check CLOUDFLARE_ACCOUNT_ID, and that the token has 'Cloudflare Pages: Edit' on that account."
    }
}

function TomlString([string]$Value) {
    return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

# --- The deploy --------------------------------------------------------------

function Invoke-Deploy {
    if ($CodeOnly -and ($SkipCode -or $PlanOnly)) { Fail '-CodeOnly cannot be combined with -SkipCode or -PlanOnly.' }

    if ([string]::IsNullOrWhiteSpace($script:Customer)) {
        $available = @(Get-ChildItem -Path $CustomerDir -Filter '*.env' |
            Where-Object { $_.BaseName -ne '_template' } |
            ForEach-Object { $_.BaseName })
        if ($available.Count -eq 0) {
            Fail 'no customer files yet. Copy infra\customers\_template.env to infra\customers\<customer>.env and fill it in.'
        }
        Write-Host ''
        Write-Host 'Customers:' -ForegroundColor Cyan
        $available | ForEach-Object { Write-Host "  - $_" }
        Write-Host ''
        $script:Customer = Read-Host 'Customer'
    }
    $name = $script:Customer

    $customerFile = Join-Path $CustomerDir "$name.env"
    if (-not (Test-Path $customerFile)) {
        Fail "no file at $customerFile. Copy infra\customers\_template.env to that name and fill it in."
    }
    $cfg = Read-DotEnv $customerFile

    $accountId = $cfg['CLOUDFLARE_ACCOUNT_ID']
    $token = $cfg['CLOUDFLARE_API_TOKEN']
    $project = $cfg['PAGES_PROJECT']
    $domain = $cfg['CUSTOM_DOMAIN']
    $zone = $cfg['CLOUDFLARE_ZONE']
    $gcpProject = $cfg['GCP_PROJECT_ID']
    $gcpAccount = $cfg['GCP_ACCOUNT']
    foreach ($required in 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PAGES_PROJECT', 'GCP_PROJECT_ID', 'VITE_API_URL') {
        if ([string]::IsNullOrWhiteSpace($cfg[$required])) { Fail "$required is blank in $name.env." }
    }
    $stateBucket = "$gcpProject-tfstate"

    Write-Host ''
    Write-Host "  $name - storefront deploy" -ForegroundColor White
    Write-Host '  ------------------------------------------' -ForegroundColor White
    Write-Host "  pages    $project.pages.dev"
    Write-Host "  domain   $(if ($domain) { $domain } else { '(none - pages.dev only)' })"
    Write-Host "  backend  $($cfg['VITE_API_URL'])"

    # -- 1. Cloudflare ----------------------------------------------------------

    Step 'Checking the Cloudflare login'
    foreach ($tool in 'terraform', 'gcloud', 'node', 'npm', 'npx') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool is not installed, or not on PATH." }
    }
    # For this script, Terraform and wrangler only - put back at the end.
    $env:CLOUDFLARE_API_TOKEN = $token
    $env:CLOUDFLARE_ACCOUNT_ID = $accountId
    [void](Invoke-Cloudflare "/accounts/$accountId/pages/projects")
    Ok 'the token can manage Pages in this account'

    # -- 2. Google Cloud, for the state bucket ------------------------------------

    Step 'Signing in to Google Cloud (Terraform state)'
    if ($gcpAccount) {
        $signedIn = @(gcloud auth list --format='value(account)' 2>$null)
        if ($signedIn -notcontains $gcpAccount) {
            Note "$gcpAccount is not signed in on this PC yet - your browser will open."
            gcloud auth login $gcpAccount --no-activate --brief
            if ($LASTEXITCODE -ne 0) { Fail "signing in as $gcpAccount failed." }
        }
        $env:CLOUDSDK_CORE_ACCOUNT = $gcpAccount
    }
    $env:CLOUDSDK_CORE_PROJECT = $gcpProject
    gcloud storage buckets describe "gs://$stateBucket" --format='value(name)' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Fail "gs://$stateBucket does not exist. Run the backend deploy for this customer first - it creates the bucket."
    }
    $gcpToken = gcloud auth print-access-token 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gcpToken)) { Fail 'could not get a Google Cloud access token.' }
    $env:GOOGLE_OAUTH_ACCESS_TOKEN = $gcpToken
    Ok "state in gs://$stateBucket/frontend"

    Push-Location $StackDir
    $script:Pushed = $true
    terraform init -input=false -reconfigure -backend-config="bucket=$stateBucket" -backend-config="prefix=frontend" | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'terraform init failed.' }

    # -- 3. Terraform -------------------------------------------------------------

    if (-not $CodeOnly) {
        # A project this script did not create - most likely one connected to
        # GitHub, which Cloudflare cannot turn into an upload project - is left
        # alone rather than taken over half way.
        $managed = @(terraform state list 2>$null)
        if ($managed -notcontains 'cloudflare_pages_project.site') {
            if ($null -ne (Invoke-Cloudflare "/accounts/$accountId/pages/projects/$project")) {
                Fail "a Pages project called '$project' already exists in this account and was not created by this script. Pick another PAGES_PROJECT; move the domain over once the new site is live."
            }
        }

        $tfvars = [ordered]@{
            account_id   = $accountId
            project_name = $project
        }
        if ($domain) { $tfvars['custom_domain'] = $domain }
        if ($zone) { $tfvars['zone_name'] = $zone }
        $script:VarFile = Join-Path $env:TEMP "pages-$name.tfvars.json"
        [System.IO.File]::WriteAllText($script:VarFile, ($tfvars | ConvertTo-Json -Depth 5), $Utf8NoBom)
        $script:PlanFile = Join-Path $env:TEMP "pages-$name.tfplan"

        Step 'Terraform plan'
        if ($PlanOnly) {
            terraform plan -input=false -var-file="$($script:VarFile)"
            if ($LASTEXITCODE -ne 0) { Fail 'terraform plan failed - read the error above. Nothing was changed.' }
            Write-Host ''
            Write-Host '  Plan only - nothing was changed.' -ForegroundColor Green
            Write-Host ''
            return
        }

        # -out="..." with the quotes: Windows PowerShell passes -out=$var through
        # literally and Terraform writes a file called '$var'.
        terraform plan -input=false -detailed-exitcode -var-file="$($script:VarFile)" -out="$($script:PlanFile)"
        $planExit = $LASTEXITCODE
        if ($planExit -eq 1) { Fail 'terraform plan failed - read the error above. Nothing was changed.' }

        if ($planExit -eq 0) {
            Ok 'already up to date - nothing to change'
        }
        else {
            if (-not $AutoApprove) {
                Write-Host ''
                Write-Host '  Read the plan above - above all, anything it will DESTROY or REPLACE.' -ForegroundColor Yellow
                Write-Host ''
                $answer = Read-Host "  Type 'apply' to continue"
                if ($answer -ne 'apply') { Fail 'cancelled - nothing was changed.' }
            }
            Step 'Terraform apply'
            terraform apply -input=false "$($script:PlanFile)"
            if ($LASTEXITCODE -ne 0) { Fail 'terraform apply failed - read the error above. Re-running is safe.' }
            Ok 'Cloudflare is up to date'
        }
    }

    $outputText = terraform output -json
    if ($LASTEXITCODE -ne 0) { Fail 'could not read the Terraform outputs.' }
    $outputs = ($outputText -join "`n") | ConvertFrom-Json
    if (-not $outputs.pages_url) { Fail "$name has no Pages project yet. Run it once without -CodeOnly." }
    $pagesUrl = $outputs.pages_url.value
    $siteUrl = $outputs.site_url.value
    $branch = $outputs.production_branch.value
    Pop-Location
    $script:Pushed = $false

    if ($SkipCode) {
        Write-Host ''
        Write-Host "  Cloudflare set up; nothing uploaded (-SkipCode). $pagesUrl" -ForegroundColor Green
        Write-Host ''
        return
    }

    # -- 4. Build -----------------------------------------------------------------

    Step 'Building the site with this customer''s settings'

    # The developer's own .env in this folder must never reach a customer's
    # site. The build runs in its own mode, 'deploy', whose settings file lists
    # EVERY setting - blanks too - and outranks .env in Vite's order. (Blanking
    # an environment variable instead does not work on Windows: an empty value
    # deletes it, and .env would fill the gap.)
    $localKeys = @()
    foreach ($file in '.env', '.env.local') {
        $path = Join-Path $SiteRoot $file
        if (Test-Path $path) { $localKeys += @((Read-DotEnv $path).Keys | Where-Object { $_ -like 'VITE_*' }) }
    }
    $keys = @($ViteKeys + $localKeys + @($cfg.Keys | Where-Object { $_ -like 'VITE_*' }) | Select-Object -Unique)
    $envLines = foreach ($key in $keys) {
        # dotenv's expansion would read "$" as a variable; the quotes keep spaces and '#'.
        $value = ([string]$cfg[$key]).Replace('$', '\$')
        if ($value.Contains("'")) { "$key=`"$($value.Replace("`n", '\n'))`"" } else { "$key='$value'" }
    }
    $script:ModeFile = Join-Path $SiteRoot '.env.deploy.local'
    [System.IO.File]::WriteAllText($script:ModeFile, (($envLines -join "`n") + "`n"), $Utf8NoBom)
    # A VITE_ variable already in this PowerShell window would outrank the file.
    foreach ($key in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($key -like 'VITE_*') {
            $script:SavedVite[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $null, 'Process')
        }
    }
    $blank = @($ViteKeys | Where-Object { [string]::IsNullOrEmpty($cfg[$_]) })
    if ($blank.Count -gt 0) { Warn "blank in $name.env (built without them): $($blank -join ', ')" }

    Push-Location $SiteRoot
    $script:Pushed = $true
    if (-not (Test-Path (Join-Path $SiteRoot 'node_modules'))) {
        Note 'installing packages (first time on this PC)'
        npm ci --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' }
    }
    # Still a production build - only the settings file differs.
    npm run build -- --mode deploy
    if ($LASTEXITCODE -ne 0) { Fail 'the build failed - read the error above. Nothing was uploaded.' }
    Remove-Item $script:ModeFile -Force -ErrorAction SilentlyContinue
    Ok 'built'

    $sha = ''
    $message = ''
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $sha = git rev-parse HEAD 2>$null
        $message = git log -1 --format=%s 2>$null
        if (@(git status --porcelain 2>$null).Count -gt 0) {
            Warn 'uploading files that are not committed to git yet'
            $message = "$message (with uncommitted changes)"
        }
    }
    Pop-Location
    $script:Pushed = $false

    # -- 5. Upload ----------------------------------------------------------------

    Step "Uploading to $project"

    # Uploaded from a folder of its own, with a wrangler.toml written for this
    # customer: the project name and the backend address the Functions read.
    # The repo's own wrangler.toml is never used, so it can never send one
    # customer's site to another's project.
    $script:Stage = Join-Path $env:TEMP "pages-deploy-$name"
    if (Test-Path $script:Stage) { Remove-Item $script:Stage -Recurse -Force }
    New-Item -ItemType Directory -Path $script:Stage | Out-Null
    Copy-Item (Join-Path $SiteRoot 'dist') (Join-Path $script:Stage 'dist') -Recurse
    if (Test-Path (Join-Path $SiteRoot 'functions')) {
        Copy-Item (Join-Path $SiteRoot 'functions') (Join-Path $script:Stage 'functions') -Recurse
    }
    $compat = '2026-07-13'
    $repoToml = Join-Path $SiteRoot 'wrangler.toml'
    if (Test-Path $repoToml) {
        $found = Select-String -Path $repoToml -Pattern 'compatibility_date\s*=\s*"([^"]+)"' | Select-Object -First 1
        if ($found) { $compat = $found.Matches[0].Groups[1].Value }
    }
    $toml = @(
        "name = $(TomlString $project)",
        'pages_build_output_dir = "dist"',
        "compatibility_date = $(TomlString $compat)",
        '',
        '[vars]',
        "API_BASE_URL = $(TomlString $cfg['VITE_API_URL'])"
    ) -join "`n"
    [System.IO.File]::WriteAllText((Join-Path $script:Stage 'wrangler.toml'), $toml + "`n", $Utf8NoBom)

    Push-Location $script:Stage
    $script:Pushed = $true
    $uploadArgs = @('--yes', 'wrangler@4', 'pages', 'deploy', 'dist', "--project-name=$project", "--branch=$branch", '--commit-dirty=true')
    if ($sha) { $uploadArgs += "--commit-hash=$sha" }
    if ($message) { $uploadArgs += "--commit-message=$($message.Replace('"', "'"))" }
    npx @uploadArgs
    $uploadExit = $LASTEXITCODE
    Pop-Location
    $script:Pushed = $false
    if ($uploadExit -ne 0) { Fail 'the upload failed - read the error above. The previous version is still live.' }
    Ok 'uploaded - this is now the live site'

    # -- 6. Check -----------------------------------------------------------------

    Step 'Checking the site answers'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $healthy = $false
    # A brand-new pages.dev address can take a minute to start answering.
    for ($try = 0; $try -lt 12 -and -not $healthy; $try++) {
        try {
            $response = Invoke-WebRequest -Uri $pagesUrl -UseBasicParsing -TimeoutSec 30
            $healthy = ($response.StatusCode -eq 200)
        }
        catch {
            Start-Sleep -Seconds 10
        }
    }
    if (-not $healthy) { Fail "$pagesUrl did not answer. Check the project in the Cloudflare dashboard." }
    Ok "$pagesUrl answers"

    Write-Host ''
    Write-Host "  $name is live" -ForegroundColor Green
    Write-Host ''
    Write-Host "    site     $siteUrl"
    if ($siteUrl -ne $pagesUrl) {
        Write-Host "    also     $pagesUrl"
        Write-Host '    (a newly connected domain can take a few minutes to get its certificate)' -ForegroundColor DarkGray
    }
    Write-Host ''
    Write-Host "  Next update:  .\infra\deploy.ps1 $name -CodeOnly" -ForegroundColor DarkGray
    Write-Host ''
}

# --- Run ---------------------------------------------------------------------

# Put back afterwards, so the PowerShell window you ran this from is left as it was.
$SavedEnv = @{}
foreach ($var in 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDSDK_CORE_ACCOUNT', 'CLOUDSDK_CORE_PROJECT', 'GOOGLE_OAUTH_ACCESS_TOKEN') {
    $SavedEnv[$var] = [Environment]::GetEnvironmentVariable($var, 'Process')
}

$script:Pushed = $false
$script:VarFile = $null
$script:PlanFile = $null
$script:Stage = $null
$script:ModeFile = $null
$script:SavedVite = @{}
$exitCode = 0

try {
    Invoke-Deploy
}
catch {
    if ($_.Exception.Message -ne 'DeployFailed') {
        Write-Host ''
        Write-Host "  ERROR  $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ''
    }
    $exitCode = 1
}
finally {
    if ($script:Pushed) { Pop-Location }
    foreach ($file in $script:PlanFile, $script:VarFile, $script:ModeFile) {
        if ($file -and (Test-Path $file)) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
    }
    if ($script:Stage -and (Test-Path $script:Stage)) { Remove-Item $script:Stage -Recurse -Force -ErrorAction SilentlyContinue }
    foreach ($var in $SavedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($var, $SavedEnv[$var], 'Process')
    }
    foreach ($var in $script:SavedVite.Keys) {
        [Environment]::SetEnvironmentVariable($var, $script:SavedVite[$var], 'Process')
    }
}

exit $exitCode
