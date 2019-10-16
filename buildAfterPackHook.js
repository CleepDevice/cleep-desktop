exports.default = async function(context) {

    // Linux workaround for issue:
    // FATAL:setuid_sandbox_host.cc(157)] The SUID sandbox helper binary was found, but is not configured correctly.
    // Rather than run without sandboxing I'm aborting now. You need to make sure that /tmp/.mount_CleepDeAMAx9/chrome-sandbox 
    // is owned by root and has mode 4755.
    // Code found:
    // https://github.com/UltimateHackingKeyboard/agent/blob/40406be5f3e33501c37e9342d868dc5ec5a3d5a2/scripts/release.js

    if (process.platform !== 'linux')
        return;

    const path = require('path');
    const fs = require('fs-extra');

    const sourceExecutable = path.join(context.appOutDir, 'cleepdesktop');
    const targetExecutable = path.join(context.appOutDir, 'cleepdesktop-bin');
    const launcherScript = path.join(__dirname, 'linux-launcher.sh');
    const chromeSandbox = path.join(context.appOutDir, 'chrome-sandbox');

    // rename cleepdesktop to cleepdesktop-bin
    await fs.rename(sourceExecutable, targetExecutable);

    // copy launcher script to cleepdesktop
    await fs.copy(launcherScript, sourceExecutable);
    await fs.chmod(sourceExecutable, 0o755);

    // remove the chrome-sandbox file since we explicitly disable it
    await fs.unlink(chromeSandbox);

};
