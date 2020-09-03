/**
 * CleepDesktop instance context
 */

const GET_CONTEXT = 'get-context';
const CONTEXT_UPDATED = 'context-updated';
const CONTEXT_CONTENT = 'context-content';

class Context {
    constructor() {
        this.version = '0.0.0';
        this.changelog = '';
    }

    init(ipcMain) {
        ipcMain.on(GET_CONTEXT, event => {
            const { sender } = event;
            sender.send(CONTEXT_CONTENT, this.getContent());
        });
    }

    getContent() {
        return {
            version: this.version,
            changelog: this.changelog,
        };
    }
}

const context = new Context()
module.exports = {
    context,
}
