# Stage edits on an unlocked copy, then move it over lib/ai/ollama.ts
$base = 'C:\Users\ritika chavan\OneDrive\Desktop\Adapt\lib\ai'
$src = Join-Path $base 'ollama.ts.bak'
$tmp = Join-Path $base 'ollama.ts.new'

$c = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)

# 1) Default timeout 30s (still overridable via OLLAMA_TIMEOUT_MS)
$c = $c.Replace('const DEFAULT_TIMEOUT_MS = 60_000;', 'const DEFAULT_TIMEOUT_MS = 30_000;')

# 2) Compact CASE DATA JSON (one line instead of pretty-printed)
$c = $c.Replace('JSON.stringify(caseData, null, 2),', 'JSON.stringify(caseData),')

# 3) Add concise-output instructions (keeps generation short)
$a = '"- Do not approve a transaction merely because records look similar.",'
$b = '"- Do not approve a transaction merely because records look similar.",' + [char]10 + '    "- Keep the reason to at most two short sentences.",' + [char]10 + '    "- Include at most 3 evidence items.",'
if (-not $c.Contains($a)) { throw 'ANCHOR3 NOT FOUND' }
$c = $c.Replace($a, $b)

# 4) Structured server-side diagnostics for Ollama failures
$old = '        console.error(' + [char]10 + '          "[OLLAMA JUDGE ERROR]",' + [char]10 + '          error' + [char]10 + '        );'
$new = '        const errorName =' + [char]10 + '          error instanceof Error ? error.name : typeof error;' + [char]10 + '        const errorMessage =' + [char]10 + '          error instanceof Error ? error.message : String(error);' + [char]10 + '        console.error(' + [char]10 + '          "[OLLAMA JUDGE ERROR]",' + [char]10 + '          JSON.stringify({' + [char]10 + '            transactionId: context.paymentId,' + [char]10 + '            model,' + [char]10 + '            url: `${baseUrl}/api/generate`,' + [char]10 + '            timeoutMs,' + [char]10 + '            errorName,' + [char]10 + '            errorMessage,' + [char]10 + '          })' + [char]10 + '        );'
if (-not $c.Contains($old)) { throw 'ANCHOR4 NOT FOUND' }
$c = $c.Replace($old, $new)

foreach ($needle in @(
  'const DEFAULT_TIMEOUT_MS = 30_000;',
  'JSON.stringify(caseData),',
  'Keep the reason to at most two short sentences.',
  'Include at most 3 evidence items.',
  'transactionId: context.paymentId'
)) {
  if (-not $c.Contains($needle)) { throw "MISSING: $needle" }
}

$fs = [System.IO.File]::Open($tmp, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
$sw = New-Object System.IO.StreamWriter($fs, (New-Object System.Text.UTF8Encoding($false)))
$sw.Write($c)
$sw.Dispose()
$fs.Dispose()

Move-Item -Path $tmp -Destination (Join-Path $base 'ollama.ts') -Force
Remove-Item -Path $src -Force
Write-Output 'OLLAMA_STABILIZED_OK'