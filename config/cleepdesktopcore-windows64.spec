# -*- mode: python -*-

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None
sentry_sdk_submodules = collect_submodules('sentry_sdk')
hidden_imports = sentry_sdk_submodules
hidden_imports.append('pkg_resources.py2_warn')

a = Analysis(['cleepdesktopcore.py'],
             pathex=[],
             binaries=[],
             datas=[
                ('core', 'core'),
                ('tools/flash.windows.bat', 'tools/'),
                ('tools/install-etcher.windows.bat', 'tools/'),
                ('tools/7z', 'tools/7z'),
                ('tools/cmdlogger-windows64', 'tools/cmdlogger-windows')
             ],
             hiddenimports=hidden_imports,
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher)
pyz = PYZ(a.pure, a.zipped_data,
             cipher=block_cipher)
exe = EXE(pyz,
          a.scripts,
          exclude_binaries=True,
          name='cleepdesktopcore',
          debug=False,
          strip=False,
          upx=False,
          console=True )
coll = COLLECT(exe,
               a.binaries,
               a.zipfiles,
               a.datas,
               strip=False,
               upx=False,
               name='cleepdesktopcore')
