import { App, PluginSettingTab, Setting } from 'obsidian';
import PandocWikiConverterPlugin from './main';

export interface PandocWikiConverterPluginSettings {
    mySetting: string;
}

export const DEFAULT_SETTINGS: PandocWikiConverterPluginSettings = {
    mySetting: 'default',
};

export class PandocWikiConverterPluginSettingsTab extends PluginSettingTab {
    plugin: PandocWikiConverterPlugin;

    constructor(app: App, plugin: PandocWikiConverterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsidian Pandoc Wiki Converter' });
    }
}
