# Microsoft VC++ 2015–2022 runtime (x64)

App-local copies of MSVC redistributable DLLs used by portable Python and PyTorch:

- `vcruntime140.dll`, `vcruntime140_1.dll`
- `msvcp140.dll`, `msvcp140_1.dll`, `msvcp140_2.dll`
- `concrt140.dll`, `vcomp140.dll`

These are redistributed under Microsoft’s VC++ redistributable terms so portable
Python (`python_embeded`) can start on clean PCs / MSIX VMs without a machine-wide
VC redist install. Refresh from `%SystemRoot%\System32` when bumping toolchains.
