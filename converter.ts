import PandocWikiConverterPlugin from 'main';
import { TFile, Notice, normalizePath } from 'obsidian';

/* -------------------- LINK DETECTOR -------------------- */

type FinalFormat = 'relative-path' | 'absolute-path' | 'shortest-path';
type LinkType = 'pandoc' | 'wiki' | 'wikiTransclusion' | 'pandocTransclusion';

interface LinkMatch {
    type: LinkType;
    match: string;
    linkText: string;
    altOrBlockRef: string;
    sourceFilePath: string;
}

const getAllLinkMatchesInFile = async (mdFile: TFile, plugin: PandocWikiConverterPlugin): Promise<LinkMatch[]> => {
    const linkMatches: LinkMatch[] = [];
    let fileText = await plugin.app.vault.read(mdFile);

    // --> Get All WikiLinks
    let wikiRegex = /\[\[@.*?\]\]/g;
    let wikiMatches = fileText.match(wikiRegex);

    if (wikiMatches) {
        let fileRegex = /(?<=\[\[).*?(?=(\]|\|))/;

        for (let wikiMatch of wikiMatches) {
            // --> Check if it is Transclusion
            if (matchIsWikiTransclusion(wikiMatch)) {
                let fileName = getTransclusionFileName(wikiMatch);
                let blockRefMatch = getTransclusionBlockRef(wikiMatch);
                if (fileName !== '' && blockRefMatch !== '') {
                    let linkMatch: LinkMatch = {
                        type: 'wikiTransclusion',
                        match: wikiMatch,
                        linkText: fileName,
                        altOrBlockRef: blockRefMatch,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            let fileMatch = wikiMatch.match(fileRegex);
            if (fileMatch) {
                // Web links are to be skipped
                if (fileMatch[0].startsWith('http')) continue;
                let linkMatch: LinkMatch = {
                    type: 'wiki',
                    match: wikiMatch,
                    linkText: fileMatch[0],
                    altOrBlockRef: '',
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }

    // --> Get All Pandoc Links
    let pandocRegEx = /(?<!\[)\[@.*?\s*\](?!\])/g;
    let pandocMatches = fileText.match(pandocRegEx);

    if (pandocMatches) {
        let fileRegex = /(?<=\[).*?(?=(\]|\|))/;
        for (let pandocMatch of pandocMatches) {
            // --> Check if it is Transclusion
            if (matchIsMdTransclusion(pandocMatch)) {
                let fileName = getTransclusionFileName(pandocMatch);
                let blockRefMatch = getTransclusionBlockRef(pandocMatch);
                if (fileName !== '' && blockRefMatch !== '') {
                    let linkMatch: LinkMatch = {
                        type: 'pandocTransclusion',
                        match: pandocMatch,
                        linkText: fileName,
                        altOrBlockRef: blockRefMatch,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            let fileMatch = pandocMatch.match(fileRegex);
            if (fileMatch) {
                // Web links are to be skipped
                let linkText = fileMatch[0].startsWith('[') ? fileMatch[0].substring(1, fileMatch[0].length) : fileMatch[0];
                if (linkText.startsWith('http')) continue;
                let linkMatch: LinkMatch = {
                    type: 'pandoc',
                    match: pandocMatch,
                    linkText: linkText,
                    altOrBlockRef: '',
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }
    return linkMatches;
};

/* -------------------- CONVERTERS -------------------- */

// --> Converts single file to provided final format and save back in the file
export const convertLinksAndSaveInSingleFile = async (mdFile: TFile, plugin: PandocWikiConverterPlugin, finalFormat: 'pandoc' | 'wiki') => {
    let fileText = await plugin.app.vault.read(mdFile);
    let newFileText =
        finalFormat === 'pandoc' ? await convertWikiLinksToPandoc(fileText, mdFile, plugin) : await convertPandocLinksToWikiLinks(fileText, mdFile, plugin);
    let fileStat = plugin.settings.keepMtime ? await plugin.app.vault.adapter.stat(normalizePath(mdFile.path)) : {};
    await plugin.app.vault.modify(mdFile, newFileText, fileStat);
};

// --> Command Function: Converts All Links and Saves in Current Active File
export const convertLinksInActiveFile = async (plugin: PandocWikiConverterPlugin, finalFormat: 'pandoc' | 'wiki') => {
    let mdFile: TFile = plugin.app.workspace.getActiveFile();
    if (mdFile.extension === 'md') {
        await convertLinksAndSaveInSingleFile(mdFile, plugin, finalFormat);
    } else {
        new Notice('Active File is not a Markdown File');
    }
};

/* -------------------- LINKS TO MARKDOWN CONVERTER -------------------- */

// --> Converts links within given string from Wiki to MD
export const convertWikiLinksToPandoc = async (md: string, sourceFile: TFile, plugin: PandocWikiConverterPlugin): Promise<string> => {
    let newMdText = md;
    let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(sourceFile, plugin);
    // --> Convert Wiki Internal Links to Markdown Link
    let wikiMatches = linkMatches.filter((match) => match.type === 'wiki');
    for (let wikiMatch of wikiMatches) {
        let mdLink = createLink('pandoc', wikiMatch.linkText, wikiMatch.altOrBlockRef, sourceFile, plugin);
        newMdText = newMdText.replace(wikiMatch.match, mdLink);
    }
    // --> Convert Wiki Transclusion Links to Markdown Transclusion
    let wikiTransclusions = linkMatches.filter((match) => match.type === 'wikiTransclusion');
    for (let wikiTransclusion of wikiTransclusions) {
        let wikiTransclusionLink = createLink('pandocTransclusion', wikiTransclusion.linkText, wikiTransclusion.altOrBlockRef, sourceFile, plugin);
        newMdText = newMdText.replace(wikiTransclusion.match, wikiTransclusionLink);
    }
    return newMdText;
};

/* -------------------- LINKS TO WIKI CONVERTER -------------------- */

// --> Converts links within given string from MD to Wiki
const convertPandocLinksToWikiLinks = async (md: string, sourceFile: TFile, plugin: PandocWikiConverterPlugin): Promise<string> => {
    let newMdText = md;
    let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(sourceFile, plugin);
    // --> Convert Markdown Internal Links to WikiLink
    let markdownMatches = linkMatches.filter((match) => match.type === 'pandoc');
    for (let markdownMatch of markdownMatches) {
        let wikiLink = createLink('wiki', markdownMatch.linkText, markdownMatch.altOrBlockRef, sourceFile, plugin);
        newMdText = newMdText.replace(markdownMatch.match, wikiLink);
    }
    // --> Convert Markdown Transclusion Links to WikiLink Transclusion
    let mdTransclusions = linkMatches.filter((match) => match.type === 'pandocTransclusion');
    for (let mdTransclusion of mdTransclusions) {
        let wikiTransclusionLink = createLink('wikiTransclusion', mdTransclusion.linkText, mdTransclusion.altOrBlockRef, sourceFile, plugin);
        newMdText = newMdText.replace(mdTransclusion.match, wikiTransclusionLink);
    }
    return newMdText;
};

/* -------------------- LINKS TO RELATIVE/ABSOLUTE/SHORTEST -------------------- */

export const convertLinksInFileToPreferredFormat = async (mdFile: TFile, plugin: PandocWikiConverterPlugin, finalFormat: FinalFormat) => {
    let fileText = await plugin.app.vault.read(mdFile);
    let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(mdFile, plugin);
    for (let linkMatch of linkMatches) {
        let fileLink = decodeURI(linkMatch.linkText);
        let file = plugin.app.metadataCache.getFirstLinkpathDest(fileLink, linkMatch.sourceFilePath);
        if (file) {
            fileLink = getFileLinkInFormat(file, mdFile, plugin, finalFormat);
            fileText = fileText.replace(linkMatch.match, createLink(linkMatch.type, fileLink, linkMatch.altOrBlockRef, mdFile, plugin));
        }
    }
    let fileStat = plugin.settings.keepMtime ? await plugin.app.vault.adapter.stat(normalizePath(mdFile.path)) : {};
    await plugin.app.vault.modify(mdFile, fileText, fileStat);
};

const getFileLinkInFormat = (file: TFile, sourceFile: TFile, plugin: PandocWikiConverterPlugin, finalFormat: FinalFormat): string => {
    let fileLink: string;
    if (finalFormat === 'absolute-path') {
        fileLink = file.path;
    } else if (finalFormat === 'relative-path') {
        fileLink = getRelativeLink(sourceFile.path, file.path);
    } else if (finalFormat === 'shortest-path') {
        let allFilesInVault = plugin.app.vault.getFiles();
        let filesWithSameName = allFilesInVault.filter((f) => f.name === file.name);
        if (filesWithSameName.length > 1) {
            fileLink = file.path;
        } else {
            fileLink = file.name;
        }
    }
    if (fileLink.endsWith('.md')) fileLink = fileLink.replace('.md', '');
    return fileLink;
};

/* -------------------- HELPERS -------------------- */

const createLink = (dest: LinkType, originalLink: string, altOrBlockRef: string, sourceFile: TFile, plugin: PandocWikiConverterPlugin): string => {
    let finalLink = originalLink;
    let altText: string;
    let titleRegEx = new RegExp('\s*-\ ');

    let fileLink = decodeURI(finalLink);
    let file = plugin.app.metadataCache.getFirstLinkpathDest(fileLink, sourceFile.path);
    if (file && plugin.settings.finalLinkFormat !== 'not-change') finalLink = getFileLinkInFormat(file, sourceFile, plugin, plugin.settings.finalLinkFormat);

    // If final link is in markdown format and the file is md, the extension should be included
    const fileExtension = file && file.extension === 'md' ? `.${file.extension}` : '';

    if (dest === 'wiki') {
        // If alt text is same as the final link or same as file base name, it needs to be empty
        if (altOrBlockRef !== '' && altOrBlockRef !== decodeURI(finalLink)) {
            if (file && decodeURI(altOrBlockRef) === file.basename) {
                altText = '';
            } else {
                altText = '|' + altOrBlockRef;
            }
        } else {
            altText = '';
        }
        let allFilesInVault = plugin.app.vault.getFiles();
        let filesWithSameName = allFilesInVault.filter((f) => f.name.startsWith(finalLink));
        if (filesWithSameName.length > 0) {
            fileLink = filesWithSameName[0].name;
        } else {
            fileLink = '???????????'
        }
        return `[[${fileLink}${altText}]]`;
    } else if (dest === 'pandoc') {
        // If there is no alt text specifiec and file exists, the alt text needs to be always the file base name
        if (altOrBlockRef !== '') {
            altText = altOrBlockRef;
        } else {
            altText = file ? file.basename : finalLink;
        }
        altText = altText.split(titleRegEx)[0].trim();
        return `[${altText}]`;
    } else if (dest === 'wikiTransclusion') {
        return `[[${decodeURI(finalLink)}]]`;
    } else if (dest === 'pandocTransclusion') {
        // --> To skip encoding ^
        let encodedBlockRef = altOrBlockRef;
        if (altOrBlockRef.startsWith('^')) {
            encodedBlockRef = customEncodeURI(encodedBlockRef.slice(1));
            encodedBlockRef = `^${encodedBlockRef}`;
        } else {
            encodedBlockRef = customEncodeURI(encodedBlockRef);
        }
        return `[${customEncodeURI(finalLink)}${fileExtension}]`;
    }

    return '';
};

/**
 * Encode URI the same way Obsidian is doing it internally
 * 
 * @param uri 
 * @returns 
 */
function customEncodeURI(uri: string): string {
    return uri.replace(/[\\\x00\x08\x0B\x0C\x0E-\x1F ]/g, urlPart => encodeURIComponent(urlPart));
}

/**
 *
 * @param sourceFilePath Path of the file, in which the links are going to be used
 * @param linkedFilePath File path, which will be referred in the source file
 * @returns
 */
function getRelativeLink(sourceFilePath: string, linkedFilePath: string) {
    function trim(arr: string[]) {
        let start = 0;
        for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
        }

        var end = arr.length - 1;
        for (; end >= 0; end--) {
            if (arr[end] !== '') break;
        }

        if (start > end) return [];
        return arr.slice(start, end - start + 1);
    }

    var fromParts = trim(sourceFilePath.split('/'));
    var toParts = trim(linkedFilePath.split('/'));

    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
        }
    }

    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length - 1; i++) {
        outputParts.push('..');
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join('/');
}

/* -------------------- TRANSCLUSIONS -------------------- */

const wikiTransclusionRegex = /\[\[(.*?)#.*?\]\]/;
const wikiTransclusionFileNameRegex = /(?<=\[\[)(.*)(?=#)/;
const wikiTransclusionBlockRef = /(?<=#).*?(?=]])/;

const mdTransclusionRegex = /\[.*?]\((.*?)#.*?\)/;
const mdTransclusionFileNameRegex = /(?<=\]\()(.*)(?=#)/;
const mdTransclusionBlockRef = /(?<=#).*?(?=\))/;

const matchIsWikiTransclusion = (match: string): boolean => {
    return wikiTransclusionRegex.test(match);
};

const matchIsMdTransclusion = (match: string): boolean => {
    return mdTransclusionRegex.test(match);
};

/**
 * @param match
 * @returns file name if there is a match or empty string if no match
 */
const getTransclusionFileName = (match: string): string => {
    let isWiki = wikiTransclusionRegex.test(match);
    let isMd = mdTransclusionRegex.test(match);
    if (isWiki || isMd) {
        let fileNameMatch = match.match(isWiki ? wikiTransclusionFileNameRegex : mdTransclusionFileNameRegex);
        if (fileNameMatch) return fileNameMatch[0];
    }
    return '';
};

/**
 * @param match
 * @returns block ref if there is a match or empty string if no match
 */
const getTransclusionBlockRef = (match: string) => {
    let isWiki = wikiTransclusionRegex.test(match);
    let isMd = mdTransclusionRegex.test(match);
    if (isWiki || isMd) {
        let blockRefMatch = match.match(isWiki ? wikiTransclusionBlockRef : mdTransclusionBlockRef);
        if (blockRefMatch) return blockRefMatch[0];
    }
    return '';
};
