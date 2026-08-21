```bash
$msix = "C:\Users\user\Documents\OpenGenStudio_0.2.1.0_x64.msix"

$sig = Get-AuthenticodeSignature $msix
$sig.SignerCertificate | Format-List Subject,Issuer,Thumbprint,NotAfter
$sig.SignerCertificate | Export-Certificate -FilePath "$env:TEMP\OpenGenStudio.cer"
Import-Certificate -FilePath "$env:TEMP\OpenGenStudio.cer" -CertStoreLocation Cert:\LocalMachine\Root
Import-Certificate -FilePath "$env:TEMP\OpenGenStudio.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPeople
```
