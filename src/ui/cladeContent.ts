import type { DinoNode } from '../data/loadTree';
import { isRedirect } from './wiki';
import type { TaxonImage } from './wiki';

export interface ContentSource { label: string; url: string }
export interface CladeContent {
    wikiTitle?: string | false;
    summary?: string;
    sources?: ContentSource[];
}
export interface CladeDescription {
    text: string;
    kind: 'local' | 'wikipedia' | 'fallback';
    sources: ContentSource[];
}

let contentPromise: Promise<Record<string, CladeContent>> | null = null;
export async function getCladeContent(name: string): Promise<CladeContent | undefined> {
    contentPromise ??= fetch('data/clade-content.json')
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));
    const content = await contentPromise;
    return content?.[name];
}

export function isSuitableCladeArticle(name: string, content: CladeContent | undefined,
                                      article: TaxonImage | null): boolean {
    return content?.wikiTitle !== false
        && !!article?.articleTitle
        && article.articleType !== 'disambiguation'
        && !isRedirect(content?.wikiTitle || name, article.articleTitle);
}

// No network or inferred biological facts: a failed lookup uses the actual tree.
export function describeClade(node: DinoNode, parent: DinoNode | undefined,
                              content: CladeContent | undefined,
                              article: TaxonImage | null): CladeDescription {
    const sources = content?.sources?.filter(s => /^https:\/\//i.test(s.url)) ?? [];
    if (content?.summary?.trim() && sources.length) {
        return { text: content.summary, kind: 'local', sources };
    }
    if (isSuitableCladeArticle(node.scientific, content, article)
        && article?.extract?.trim()
        && article.pageUrl?.startsWith('https://en.wikipedia.org/wiki/')) {
        return {
            text: article.extract, kind: 'wikipedia',
            sources: [{ label: 'From Wikipedia', url: article.pageUrl }],
        };
    }
    return {
        text: parent
            ? `In Dinozoa’s classification, ${node.scientific} is a subgroup of ${parent.scientific}.`
            : `${node.scientific} is the root of Dinozoa’s classification.`,
        kind: 'fallback', sources: [],
    };
}
