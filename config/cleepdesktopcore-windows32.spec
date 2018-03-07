# -*- mode: python -*-

block_cipher = None

a = Analysis(['cleepdesktopcore.py'],
             pathex=[],
             binaries=[],
             datas=[
                ('core', 'core'),
                ('tools/etcher-cli.windows.bat', 'scripts/etcher-cli.windows.bat'),
                ('tools/install-etcher.windows.bat', 'scripts/install-etcher.windows.bat'),
                ('tools/7z', 'tools/7z'),
                ('tools/cmdlogger-windows32', 'tools/cmdlogger-windows')
             ],
             hiddenimports=[],
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
