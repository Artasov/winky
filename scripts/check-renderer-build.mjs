import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

class RendererBuildCheck {
    constructor() {
        const scriptPath = fileURLToPath(import.meta.url);
        this.root = path.resolve(path.dirname(scriptPath), '..');
        this.rendererDirectory = path.join(this.root, 'dist', 'renderer');
    }

    run() {
        const tauriConfig = this.readJson(path.join(this.root, 'src-tauri', 'tauri.conf.json'));
        this.checkCsp(tauriConfig);

        const htmlPath = path.join(this.rendererDirectory, 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const stylesheetPaths = this.getStylesheetPaths(html);
        const css = stylesheetPaths.map((stylesheetPath) => fs.readFileSync(stylesheetPath, 'utf8')).join('\n');

        this.has(css, '--color-primary:', 'theme variables');
        this.hasRule(css, '.fr', ['display:flex', 'flex-direction:row'], 'wide flex classes');
        this.hasRule(css, '.fixed', ['position:fixed'], 'Tailwind utilities');

        console.log(`[check-renderer-build] Validated ${stylesheetPaths.length} stylesheets and runtime style CSP.`);
    }

    readJson(filePath) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    checkCsp(tauriConfig) {
        const security = tauriConfig.app?.security;
        const csp = security?.csp;
        if (typeof csp !== 'string') throw new Error('Tauri CSP must be configured as a string.');

        const styleDirective = csp
            .split(';')
            .map((directive) => directive.trim())
            .find((directive) => directive.startsWith('style-src '));
        if (!styleDirective?.includes("'unsafe-inline'")) {
            throw new Error("Tauri style-src must allow MUI/Emotion runtime styles with 'unsafe-inline'.");
        }

        const disabledModifications = security.dangerousDisableAssetCspModification;
        if (!Array.isArray(disabledModifications) || !disabledModifications.includes('style-src')) {
            throw new Error('Tauri CSP asset modification must be disabled only for style-src.');
        }
    }

    getStylesheetPaths(html) {
        const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
        const stylesheetPaths = linkTags
            .filter((tag) => /\brel=(['"])stylesheet\1/i.test(tag))
            .map((tag) => {
                const href = tag.match(/\bhref=(['"])([^'"]+)\1/i)?.[2];
                if (!href) throw new Error(`Stylesheet link has no href: ${tag}`);
                if (/^[a-z]+:/i.test(href)) throw new Error(`Renderer stylesheet must be bundled locally: ${href}`);

                const cleanPath = href.split(/[?#]/, 1)[0].replace(/^(?:\.\/|\/)+/, '');
                const stylesheetPath = path.join(this.rendererDirectory, cleanPath);
                if (!fs.existsSync(stylesheetPath)) throw new Error(`Bundled stylesheet is missing: ${href}`);
                return stylesheetPath;
            });

        if (stylesheetPaths.length === 0) throw new Error('Built renderer has no stylesheet links.');
        return stylesheetPaths;
    }

    has(css, value, label) {
        if (!css.includes(value)) throw new Error(`Built renderer CSS is missing ${label}.`);
    }

    hasRule(css, selector, declarations, label) {
        const ruleStart = css.indexOf(`${selector}{`);
        const ruleEnd = ruleStart >= 0 ? css.indexOf('}', ruleStart) : -1;
        const rule = ruleEnd >= 0 ? css.slice(ruleStart, ruleEnd) : '';
        if (declarations.some((declaration) => !rule.includes(declaration))) {
            throw new Error(`Built renderer CSS is missing ${label}.`);
        }
    }
}

new RendererBuildCheck().run();
