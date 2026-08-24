# Temporary script: apply Ollama stabilization edits to lib/ai/ollama.ts
$p = 'C:\Users\ritika chavan\OneDrive\Desktop\Adapt\lib\ai\ollama.ts'
$c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)

# 1) Default timeout 30s (still overridable via OLLAMA_TIMEOUT_MS)
$c = $c.Replace('const DEFAULT_TIMEOUT_MS = 60_000;', 'const DEFAULT_TIMEOUT_MS = 30_000;')

# 2) Compact CASE DATA JSON (one line instead of pretty-printed)
$c = $c.Replace('JSON.stringify(caseData, null, 2),', 'JSON.stringify(caseData),')

# 3) Add concise-output instructions (keeps generation short)
$c = $c.Replace(
  '"- Do not approve a transaction merely because records look similar.",',
  '"- Do not approve a transaction merely because records look similar.",' + [char]10 + '    "- Keep the reason to at most two short sentences.",' + [char]10 + '    "- Include at most 3 evidence items.",'
)

# 4) Structured server-side diagnostics for Ollama failures
$oldLog = '        console.error(' + [char]10 + '          "[OLLAMA JUDGE ERROR]",' + [char]10 + '          error' + [char]10 + '        );'
$newLog = '        const errorName =' + [char]10 + '          error instanceof Error ? error.name : typeof error;' + [char]10 + '        const errorMessage =' + [char]10 + '          error instanceof Error ? error.message : String(error);' + [char]10 + '        console.error(' + [char]10 + '          "[OLLAMA JUDGE ERROR]",' + [char]10 + '          JSON.stringify({' + [char]10 + '            transactionId: context.paymentId,' + [char]10 + '            model,' + [char]10 + '            url: `${baseUrl}/api/generate`,' + [char]10 + '            timeoutMs,' + [char]10 + '            errorName,' + [char]10 + '            errorMessage,' + [char]10 + '          })' + [char]10 + '        );'
if (-not $c.Contains($oldLog)) {
  throw 'OLD LOG BLOCK NOT FOUND - aborting'
}
$c = $c.Replace($oldLog, $newLog)

# Verify all replacements landed
foreach ($needle in @(
  'const DEFAULT_TIMEOUT_MS = 30_000;',
  'JSON.stringify(caseData),',
  'Keep the reason to at most two short sentences.',
  'Include at most 3 evidence items.',
  'transactionId: context.paymentId'
)) {
  if (-not $c.Contains($needle)) {
    throw "MISSING EXPECTED CONTENT: $needle"
  }
}

# 5) Write back via FileStream + ReadWrite share (bypasses "user-mapped section").
$fs = [System.IO.File]::Open($p, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
$sw = New-Object System.IO.StreamWriter($fs, (New-Object System.Text.UTF8Encoding($false)))
$sw.Write($c)
$sw.Dispose()
$fs.Dispose()

Write-Output 'OLLAMA_EDITS_APPLIED_OK'
Write-Output 'OLLAMA_EDITS_APPLIED_OK'
