@echo off
:: variables
set "CLEEPDESKTOPPATH=packaging\cleepdesktop_tree"

:: clear previous process files
rmdir /Q /S dist
rmdir /Q /S packaging

:: create dirs
mkdir %CLEEPDESKTOPPATH%

:: pyinstaller
echo.
echo.
echo Packaging cleepdesktopcore...
echo -----------------------------
py -3 -m pip install -r ./requirements.txt
py -3 -m pip freeze
xcopy /q /y config\cleepdesktopcore-windows64.spec .
py -3 -m PyInstaller --workpath packaging --clean --noconfirm --noupx --windowed --debug all --log-level INFO cleepdesktopcore-windows64.spec
del /q cleepdesktopcore-windows64.spec
echo Generated files:
dir dist\cleepdesktopcore
move dist\cleepdesktopcore %CLEEPDESKTOPPATH%
:: 2021-04-01 WORKAROUND: fix with pyzmq that moves libs from different place. Wait for new pyinstaller release (>2021.1)
echo Workaround with pyzmq dlls that are missing...
py -3 -c "import site; print(site.getsitepackages()[1])" > pysite.txt
set /P PYSITE=<pysite.txt
del pysite.txt
mkdir %CLEEPDESKTOPPATH%\cleepdesktopcore\pyzmq.libs
echo PYSITE=%PYSITE%
dir %PYSITE%
echo xcopy /s "%PYSITE%\pyzmq.libs" "%CLEEPDESKTOPPATH%\cleepdesktopcore\pyzmq.libs"
xcopy /s "%PYSITE%\pyzmq.libs" "%CLEEPDESKTOPPATH%\cleepdesktopcore\pyzmq.libs"
dir %CLEEPDESKTOPPATH%\cleepdesktopcore

:: electron
echo.
echo.
echo Building electron app...
echo ------------------------
call npm ci
cmd /C "node_modules\.bin\tsc --outDir %CLEEPDESKTOPPATH%"
echo Done

:: copy files and dirs
echo.
echo.
echo Copying release files...
echo ------------------------
echo html...
mkdir %CLEEPDESKTOPPATH%\html
xcopy /S html %CLEEPDESKTOPPATH%\html
mkdir %CLEEPDESKTOPPATH%\resources
xcopy /S resources %CLEEPDESKTOPPATH%\resources
xcopy LICENSE.txt %CLEEPDESKTOPPATH%\
xcopy package.json %CLEEPDESKTOPPATH%\
xcopy README.md %CLEEPDESKTOPPATH%\
echo Done

:: electron-builder
echo.
echo.
:: to debug electron-builder uncomment line below
:: set DEBUG=electron-builder,electron-builder:*
if "%1" == "publish" (
    echo Publishing cleepdesktop...
    echo --------------------------
    set "GH_TOKEN=%GH_TOKEN_CLEEPDESKTOP%"
    cmd /C "node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH% --publish always"
) else (
    echo Packaging cleepdesktop...
    echo -------------------------
    cmd /C "node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH%"
)

:: finalizing moving generated stuff to dist directory and removing temp stuff
echo.
echo.
echo Finalizing...
echo -------------
ping 127.0.0.1 -n 2 > nul
mkdir dist
xcopy /Q /S %CLEEPDESKTOPPATH%\dist dist
if "%1" == "publish" (
    rmdir /Q /S packaging
)
rmdir /Q /S __pycache__
rmdir /Q /S core\__pycache__
rmdir /Q /S core\libs\__pycache__
rmdir /Q /S core\modules\__pycache__
echo Done

echo.
echo Build result in dist/ folder