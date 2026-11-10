$ErrorActionPreference = 'Stop'
$jarsigner = 'C:\Users\VAROTTO\.bubblewrap\jdk\jdk-17.0.11+9\bin\jarsigner.exe'
$keystore = 'C:\Users\VAROTTO\.bubblewrap\keys\vizinhocerto-upload.keystore'
$entrada = Join-Path $PSScriptRoot 'VizinhoCerto-1.0.8-v12-Notificacoes.aab'
$saida = Join-Path $PSScriptRoot 'VizinhoCerto-1.0.8-v12-Notificacoes-signed.aab'
try {
  if (Test-Path -LiteralPath $saida) { throw 'O pacote assinado ja existe. Confira esse arquivo antes de assinar novamente.' }
  Write-Host 'Digite a senha da chave somente nesta janela. Nao envie a senha pelo chat.'
  & $jarsigner -keystore $keystore -signedjar $saida $entrada 'vizinhocerto-upload'
  if ($LASTEXITCODE -ne 0) { throw 'A assinatura nao foi concluida.' }
  & $jarsigner -verify $saida
  if ($LASTEXITCODE -ne 0) { throw 'A verificacao da assinatura falhou.' }
  Write-Host "Pronto para enviar a Play Console: $saida" -ForegroundColor Green
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
  Read-Host 'Pressione Enter para fechar'
}
