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

export interface CladeImage extends Pick<TaxonImage,
    'imageUrl' | 'fallbackUrl' | 'artist' | 'fileUrl' | 'imageTitle' | 'licenseName' | 'licenseUrl'> {
    caption: string;
    reviewNote: string;
}

let imagePromise: Promise<Record<string, CladeImage>> | null = null;
export async function getCladeImage(name: string): Promise<CladeImage | undefined> {
    imagePromise ??= fetch('data/clade-images.json')
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));
    return (await imagePromise)?.[name];
}

// Temporary fix: reviewed image picks are independent of article descriptions.
// Review each entry in clade-images.json before replacing a representative or redirect image.
export function selectCladeImage(name: string, content: CladeContent | undefined,
                                 article: TaxonImage | null, selected?: CladeImage): CladeImage | TaxonImage | null {
    if (selected?.imageUrl?.startsWith('https://')) return selected;
    return isSuitableCladeArticle(name, content, article) ? article : null;
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
