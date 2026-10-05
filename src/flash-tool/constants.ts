import { app } from 'electron';
import path from 'path';

export const FLASHTOOL_DIR = path.join(app.getPath('userData'), 'flash-tool');
