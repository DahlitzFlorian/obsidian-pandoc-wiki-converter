import { Menu, Plugin, TFile, addIcon } from 'obsidian';
import { PandocWikiConverterPluginSettingsTab, PandocWikiConverterPluginSettings, DEFAULT_SETTINGS } from './settings';
import * as Converter from 'converter';
import * as Icons from './icons';

export default class PandocWikiConverterPlugin extends Plugin {
    settings: PandocWikiConverterPluginSettings;

    async onload() {
        console.log('Link Converter Loading...');

        addIcon('bracketIcon', Icons.BRACKET_ICON);
        addIcon('markdownIcon', Icons.MARKDOWN_ICON);
        addIcon('linkEditIcon', Icons.LINK_EDIT_ICON);

        await this.loadSettings();
        this.addSettingTab(new PandocWikiConverterPluginSettingsTab(this.app, this));

        this.addCommand({
            id: 'convert-wikis-to-pandoc-in-active-file',
            name: 'Active File: WikiLinks to Pandoc',
            callback: () => {
                Converter.convertLinksInActiveFile(this, 'pandoc');
            },
        });

        this.addCommand({
            id: 'convert-pandoc-to-wikis-in-active-file',
            name: 'Active File: Pandoc Links to Wiki',
            callback: () => {
                Converter.convertLinksInActiveFile(this, 'wiki');
            },
        });
    }

    onunload() {
        console.log('Link Converter Unloading...');
        this.app.workspace.off('file-menu', this.addFileMenuItems);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    addFileMenuItems = (menu: Menu, file: TFile) => {
        if (!(file instanceof TFile && file.extension === 'md')) return;

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Pandoc Links to Wiki')
                .setIcon('bracketIcon')
                .onClick(() => Converter.convertLinksAndSaveInSingleFile(file, this, 'wiki'));
        });

        menu.addItem((item) => {
            item.setTitle('WikiLinks to Pandoc')
                .setIcon('markdownIcon')
                .onClick(() => Converter.convertLinksAndSaveInSingleFile(file, this, 'pandoc'));
        });

        menu.addSeparator();
    };
}
