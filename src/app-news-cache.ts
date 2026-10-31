import { app } from 'electron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { appLogger } from './app-logger';
import { handleInvoke, ipcErr, ipcOk } from './ipc/ipc-main';
import { asBasename } from './utils/safe-path';

/** Article as sent by the renderer (remote cover URLs). */
export type NewsCacheIncomingArticle = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  publishedAt: number | null;
  /** Remote https cover URL, or null. */
  coverUrl: string | null;
};

/** Article returned to the renderer for display (cover as data URL when cached). */
export type NewsCacheArticle = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  publishedAt: number | null;
  /** Original remote cover URL (for fingerprint / re-download). */
  coverSourceUrl: string | null;
  /** data: URL for offline img, else null. */
  coverUrl: string | null;
};

type NewsCacheFile = {
  version: 1;
  fetchedAt: number;
  articles: Array<{
    id: number;
    title: string;
    slug: string;
    excerpt: string;
    bodyHtml: string;
    publishedAt: number | null;
    coverSourceUrl: string | null;
    coverFilename: string | null;
  }>;
};

export class AppNewsCache {
  private readonly cacheDir = path.join(app.getPath('userData'), 'news-cache');
  private readonly coversDir = path.join(this.cacheDir, 'covers');
  private readonly indexPath = path.join(this.cacheDir, 'articles.json');

  constructor() {
    fs.mkdirSync(this.coversDir, { recursive: true });
    this.addIpcs();
  }

  private addIpcs(): void {
    handleInvoke('news-cache-get', async () => {
      try {
        return ipcOk(await this.get());
      } catch (error) {
        appLogger.error('Unable to read news cache', { error });
        return ipcErr('NEWS_CACHE_GET_FAILED', 'Unable to read news cache');
      }
    });

    handleInvoke('news-cache-save', async (_event, articles) => {
      try {
        const saved = await this.save(articles);
        return ipcOk(saved);
      } catch (error) {
        appLogger.error('Unable to save news cache', { error });
        return ipcErr('NEWS_CACHE_SAVE_FAILED', 'Unable to save news cache');
      }
    });
  }

  public async get(): Promise<{ fetchedAt: number; articles: NewsCacheArticle[] } | null> {
    if (!fs.existsSync(this.indexPath)) {
      return null;
    }
    const raw = fs.readFileSync(this.indexPath, { encoding: 'utf8' });
    const parsed = JSON.parse(raw) as NewsCacheFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.articles)) {
      return null;
    }

    const articles: NewsCacheArticle[] = parsed.articles.map((item) => ({
      id: item.id,
      title: item.title || '',
      slug: item.slug || '',
      excerpt: item.excerpt || '',
      bodyHtml: item.bodyHtml || '',
      publishedAt: item.publishedAt ?? null,
      coverSourceUrl: item.coverSourceUrl || null,
      coverUrl: item.coverFilename ? this.coverToDataUrl(item.coverFilename) : null,
    }));

    return { fetchedAt: parsed.fetchedAt || 0, articles };
  }

  public async save(incoming: NewsCacheIncomingArticle[]): Promise<{
    fetchedAt: number;
    articles: NewsCacheArticle[];
  }> {
    let previousFile: NewsCacheFile | null = null;
    try {
      if (fs.existsSync(this.indexPath)) {
        previousFile = JSON.parse(fs.readFileSync(this.indexPath, { encoding: 'utf8' })) as NewsCacheFile;
      }
    } catch {
      previousFile = null;
    }
    const previousBySlug = new Map(
      (previousFile?.articles || []).map((article) => [article.slug, article]),
    );

    const stored: NewsCacheFile['articles'] = [];
    const keepCoverFiles = new Set<string>();

    for (const article of incoming || []) {
      const slug = this.safeBasename(String(article.slug || '').trim());
      if (!slug) {
        continue;
      }

      const remoteCover = (article.coverUrl || '').trim() || null;
      const prev = previousBySlug.get(slug);
      let coverFilename: string | null = null;

      if (remoteCover) {
        const ext = this.extFromUrl(remoteCover);
        coverFilename = `${slug}${ext}`;
        const coverPath = path.join(this.coversDir, coverFilename);
        const canReuse =
          !!prev &&
          prev.coverSourceUrl === remoteCover &&
          !!prev.coverFilename &&
          fs.existsSync(path.join(this.coversDir, prev.coverFilename));

        if (!canReuse) {
          await this.downloadCover(remoteCover, coverPath);
        } else if (prev.coverFilename) {
          coverFilename = prev.coverFilename;
        }
        keepCoverFiles.add(coverFilename);
      }

      stored.push({
        id: Number(article.id) || 0,
        title: article.title || '',
        slug,
        excerpt: article.excerpt || '',
        bodyHtml: article.bodyHtml || '',
        publishedAt: article.publishedAt ?? null,
        coverSourceUrl: remoteCover,
        coverFilename,
      });
    }

    this.pruneCovers(keepCoverFiles);

    const payload: NewsCacheFile = {
      version: 1,
      fetchedAt: Date.now(),
      articles: stored,
    };
    fs.writeFileSync(this.indexPath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8' });

    const loaded = await this.get();
    if (!loaded) {
      throw new Error('News cache write verification failed');
    }
    return loaded;
  }

  private async downloadCover(url: string, destPath: string): Promise<void> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 8 * 1024 * 1024,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
  }

  private safeBasename(filename: string): string | null {
    try {
      return asBasename(filename);
    } catch {
      return null;
    }
  }

  private coverToDataUrl(filename: string): string | null {
    const safe = this.safeBasename(filename);
    if (!safe) {
      return null;
    }
    const coverPath = path.join(this.coversDir, safe);
    if (!fs.existsSync(coverPath)) {
      return null;
    }
    try {
      const buffer = fs.readFileSync(coverPath);
      const mime = this.mimeFromExt(path.extname(safe));
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (error) {
      appLogger.warn(`Unable to read cached news cover ${safe}`, error);
      return null;
    }
  }

  private pruneCovers(keep: Set<string>): void {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.coversDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (keep.has(name)) {
        continue;
      }
      try {
        fs.unlinkSync(path.join(this.coversDir, name));
      } catch {
        // ignore
      }
    }
  }

  private extFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
        return ext === '.jpeg' ? '.jpg' : ext;
      }
    } catch {
      // fall through
    }
    return '.jpg';
  }

  private mimeFromExt(ext: string): string {
    switch (ext.toLowerCase()) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        return 'image/jpeg';
    }
  }
}

export const appNewsCache = new AppNewsCache();
