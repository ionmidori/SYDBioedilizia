<#
.SYNOPSIS
Idempotent GCP telemetry provisioning for SYD ADK agents (chatbotluca-a8a73).
Creates:
  1. BigQuery dataset `syd_telemetry` (EU, 180-day partition expiration)
  2. Cloud Logging Sink `syd-agent-telemetry-bq` -> BigQuery + writer IAM grant
  3. 7 Cloud Logging log-based metrics (tokens, cache, thinking, calls, cost)
  4. Cloud Monitoring dashboard `SYD Agents — Latency, Tokens & Cost`
#>
param(
    [string]$ProjectId = "chatbotluca-a8a73",
    [string]$DatasetId = "syd_telemetry",
    [string]$Location = "EU"
)

$ErrorActionPreference = "Stop"
$env:CLOUDSDK_METRICS_ENVIRONMENT = if ($env:CLOUDSDK_METRICS_ENVIRONMENT) {
    "$($env:CLOUDSDK_METRICS_ENVIRONMENT) datacloud.antigravity"
} else {
    "datacloud.antigravity"
}

function Invoke-GcloudOptional {
    param([scriptblock]$Block)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & $Block 2>$null
        if ($LASTEXITCODE -eq 0) { return $out }
        return $null
    } finally {
        $ErrorActionPreference = $prev
    }
}

Write-Host "=== 1. BigQuery Dataset ($DatasetId in $Location) ==="
$existingDs = Invoke-GcloudOptional { bq --project_id=$ProjectId ls --datasets --format=sparse | Select-String -Pattern "\b$DatasetId\b" }
if (-not $existingDs) {
    bq --project_id=$ProjectId mk --dataset --location=$Location --default_table_expiration=15552000 --default_partition_expiration=15552000 --label=datacloud:antigravity --description="SYD ADK agent telemetry (chat_turn_timing & llm_call_timing)" "${ProjectId}:${DatasetId}"
} else {
    Write-Host "Dataset $DatasetId already exists."
}

Write-Host "=== 2. Cloud Logging Sink -> BigQuery ==="
$sinkName = "syd-agent-telemetry-bq"
$sinkFilter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND (jsonPayload.event="chat_turn_timing" OR jsonPayload.event="llm_call_timing")'
$sinkDest = "bigquery.googleapis.com/projects/$ProjectId/datasets/$DatasetId"

$sinkExists = Invoke-GcloudOptional { gcloud --quiet --billing-project=$ProjectId logging sinks describe $sinkName --project=$ProjectId --format="value(name)" }
if (-not $sinkExists) {
    gcloud --quiet --billing-project=$ProjectId logging sinks create $sinkName $sinkDest --project=$ProjectId --log-filter=$sinkFilter --use-partitioned-tables
} else {
    gcloud --quiet --billing-project=$ProjectId logging sinks update $sinkName $sinkDest --project=$ProjectId --log-filter=$sinkFilter --use-partitioned-tables
}

$writerIdentity = gcloud --quiet --billing-project=$ProjectId logging sinks describe $sinkName --project=$ProjectId --format="value(writerIdentity)"
Write-Host "Granting roles/bigquery.dataEditor to $writerIdentity on dataset $DatasetId..."
$saEmail = $writerIdentity -replace '^serviceAccount:', ''
$aclPath = "$env:TEMP\bq_ds_acl.json"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$rawAcl = (bq --project_id=$ProjectId show --format=prettyjson "${ProjectId}:${DatasetId}") -join "`n"
$dsJson = $rawAcl | ConvertFrom-Json
$alreadyGranted = $dsJson.access | Where-Object { $_.userByEmail -eq $saEmail -and $_.role -eq "WRITER" }
if (-not $alreadyGranted) {
    $dsJson.access += [PSCustomObject]@{ role = "WRITER"; userByEmail = $saEmail }
    [System.IO.File]::WriteAllText($aclPath, ($dsJson | ConvertTo-Json -Depth 10), $utf8NoBom)
    bq --project_id=$ProjectId update --source="$aclPath" "${ProjectId}:${DatasetId}"
} else {
    Write-Host "BigQuery WRITER already granted to $saEmail."
}
Remove-Item $aclPath -ErrorAction SilentlyContinue

Write-Host "=== 3. Log-based Metrics ==="
$metrics = @(
    @{
        Name = "chat_prompt_tokens"
        Desc = "Total prompt tokens per chat turn."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="chat_turn_timing" AND jsonPayload.prompt_tokens_total>=0'
        Extractor = "EXTRACT(jsonPayload.prompt_tokens_total)"
        Labels = @{ primary_agent = "EXTRACT(jsonPayload.primary_agent)" }
        Scale = 200.0; Growth = 1.25; Buckets = 48; Unit = "1"
    },
    @{
        Name = "chat_cached_tokens"
        Desc = "Total cached prompt tokens per chat turn."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="chat_turn_timing" AND jsonPayload.cached_tokens_total>=0'
        Extractor = "EXTRACT(jsonPayload.cached_tokens_total)"
        Labels = @{ primary_agent = "EXTRACT(jsonPayload.primary_agent)" }
        Scale = 100.0; Growth = 1.25; Buckets = 48; Unit = "1"
    },
    @{
        Name = "chat_thoughts_tokens"
        Desc = "Total thinking/reasoning tokens per chat turn."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="chat_turn_timing" AND jsonPayload.thoughts_tokens_total>=0'
        Extractor = "EXTRACT(jsonPayload.thoughts_tokens_total)"
        Labels = @{ primary_agent = "EXTRACT(jsonPayload.primary_agent)" }
        Scale = 50.0; Growth = 1.25; Buckets = 48; Unit = "1"
    },
    @{
        Name = "chat_output_tokens"
        Desc = "Total output tokens per chat turn."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="chat_turn_timing" AND jsonPayload.output_tokens_total>=0'
        Extractor = "EXTRACT(jsonPayload.output_tokens_total)"
        Labels = @{ primary_agent = "EXTRACT(jsonPayload.primary_agent)" }
        Scale = 50.0; Growth = 1.25; Buckets = 48; Unit = "1"
    },
    @{
        Name = "chat_llm_calls_count"
        Desc = "Number of LLM calls executed per chat turn."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="chat_turn_timing" AND jsonPayload.n_llm_calls>=0'
        Extractor = "EXTRACT(jsonPayload.n_llm_calls)"
        Labels = @{ primary_agent = "EXTRACT(jsonPayload.primary_agent)" }
        Scale = 1.0; Growth = 1.5; Buckets = 16; Unit = "1"
    },
    @{
        Name = "llm_call_duration_ms"
        Desc = "Single LLM call pure model duration in ms, broken down by agent and model."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="llm_call_timing" AND jsonPayload.model_ms>0'
        Extractor = "EXTRACT(jsonPayload.model_ms)"
        Labels = @{ agent = "EXTRACT(jsonPayload.agent)"; model = "EXTRACT(jsonPayload.model)" }
        Scale = 50.0; Growth = 1.2; Buckets = 64; Unit = "ms"
    },
    @{
        Name = "llm_call_cost_usd"
        Desc = "Estimated USD cost per LLM call (in micro-USD, x1e6) by agent and model."
        Filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="syd-brain" AND jsonPayload.event="llm_call_timing" AND jsonPayload.estimated_cost_usd>=0'
        Extractor = "EXTRACT(jsonPayload.estimated_cost_usd)"
        Labels = @{ agent = "EXTRACT(jsonPayload.agent)"; model = "EXTRACT(jsonPayload.model)" }
        Scale = 0.0001; Growth = 1.4; Buckets = 32; Unit = "1"
    }
)

foreach ($m in $metrics) {
    $labelDefs = @()
    foreach ($k in $m.Labels.Keys) {
        $labelDefs += "  - key: $k`n    valueType: STRING"
    }
    $labelExt = @()
    foreach ($k in $m.Labels.Keys) {
        $labelExt += "  ${k}: $($m.Labels[$k])"
    }
    $yaml = @"
name: $($m.Name)
description: $($m.Desc)
filter: $($m.Filter)
valueExtractor: $($m.Extractor)
labelExtractors:
$($labelExt -join "`n")
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: "$($m.Unit)"
  labels:
$($labelDefs -join "`n")
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: $($m.Buckets)
    growthFactor: $($m.Growth)
    scale: $($m.Scale)
"@
    $tmp = "$env:TEMP\metric_$($m.Name).yaml"
    [System.IO.File]::WriteAllText($tmp, $yaml, $utf8NoBom)
    $exists = Invoke-GcloudOptional { gcloud --quiet --billing-project=$ProjectId logging metrics describe $m.Name --project=$ProjectId --format="value(name)" }
    if (-not $exists) {
        gcloud --quiet --billing-project=$ProjectId logging metrics create $m.Name --project=$ProjectId --config-from-file=$tmp
    } else {
        gcloud --quiet --billing-project=$ProjectId logging metrics update $m.Name --project=$ProjectId --config-from-file=$tmp
    }
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

Write-Host "=== 4. Cloud Monitoring Dashboard ==="
$dashFile = Join-Path $PSScriptRoot "syd-agents-dashboard.json"
$targetTitle = (Get-Content $dashFile -Raw -Encoding utf8 | ConvertFrom-Json).displayName
$allDashesRaw = Invoke-GcloudOptional { gcloud --quiet --billing-project=$ProjectId monitoring dashboards list --project=$ProjectId --format=json }
$existingDash = $null
if ($allDashesRaw) {
    $matched = ($allDashesRaw -join "`n" | ConvertFrom-Json) | Where-Object { $_.displayName -eq $targetTitle } | Select-Object -First 1
    if ($matched) { $existingDash = $matched.name }
}
if (-not $existingDash) {
    gcloud --quiet --billing-project=$ProjectId monitoring dashboards create --project=$ProjectId --config-from-file=$dashFile
} else {
    Write-Host "Updating existing dashboard $existingDash..."
    $etag = gcloud --quiet --billing-project=$ProjectId monitoring dashboards describe $existingDash --project=$ProjectId --format="value(etag)"
    $dashObj = Get-Content $dashFile -Raw | ConvertFrom-Json
    $dashObj | Add-Member -NotePropertyName etag -NotePropertyValue $etag -Force
    $tmpDash = "$env:TEMP\syd_dash_update.json"
    [System.IO.File]::WriteAllText($tmpDash, ($dashObj | ConvertTo-Json -Depth 20), $utf8NoBom)
    gcloud --quiet --billing-project=$ProjectId monitoring dashboards update $existingDash --project=$ProjectId --config-from-file=$tmpDash
    Remove-Item $tmpDash -ErrorAction SilentlyContinue
}
Write-Host "Done!"
