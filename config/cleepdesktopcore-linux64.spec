# -*- mode: python -*-

block_cipher = None

a = Analysis(['cleepdesktopcore.py'],
             pathex=[],
             binaries=[],
             datas=[
                ('core', 'core'),
                ('tools/install-etcher.linux', 'scripts/install-etcher.linux'),
                ('tools/etcher-cli.linux', 'scripts/etcher-cli.linux'),
                ('tools/cmdlogger-linux64', 'tools/cmdlogger-linux')
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
