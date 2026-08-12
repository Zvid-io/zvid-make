import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repositoryRoot, 'src', 'zvid');
const catalog = JSON.parse(
    await readFile(resolve(repositoryRoot, 'submission', 'module-catalog.json'), 'utf8'),
);

const args = process.argv.slice(2);
const write = args.includes('--write');
const targetArgument = args.find((argument) => argument !== '--write');

if (!targetArgument) {
    console.error('Usage: npm run scaffold:clone -- <path-to-local-make-clone> [--write]');
    console.error('The command is a dry run unless --write is supplied.');
    process.exitCode = 1;
} else {
    await scaffoldClone(resolve(targetArgument));
}

async function scaffoldClone(targetRoot) {
    const manifestPath = resolve(targetRoot, 'makecomapp.json');
    const manifestText = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    const originalOrigins = JSON.stringify(manifest.origins ?? []);
    const components = manifest.components ?? (manifest.components = {});
    const moduleMap = components.module ?? (components.module = {});
    const webhookMap = components.webhook ?? (components.webhook = {});
    const connectionName = findConnectionName(components.connection ?? {});
    const supportedTypes = new Set(['action', 'search', 'universal', 'instant-trigger']);
    const supportedModules = catalog.modules.filter((module) => supportedTypes.has(module.type));
    const skippedModules = catalog.modules.filter((module) => !supportedTypes.has(module.type));
    const webhookResult = ensureWebhook(webhookMap, moduleMap, connectionName);
    const webhookName = webhookResult.name;
    const created = [];
    const updated = [];

    for (const module of supportedModules) {
        const existing = moduleMap[module.name];
        if (existing) {
            applyMetadata(existing, module, connectionName, webhookName);
            updated.push(module.name);
            continue;
        }

        moduleMap[module.name] = createModuleEntry(module, connectionName, webhookName);
        created.push(module.name);
    }

    if (JSON.stringify(manifest.origins ?? []) !== originalOrigins) {
        throw new Error('Refusing to modify Make origin mappings.');
    }

    const copies = [];
    addCopy(copies, targetRoot, 'general/base.iml.json', manifest.generalCodeFiles?.base);
    addCopy(copies, targetRoot, 'README.md', manifest.generalCodeFiles?.readme);
    collectConnectionCopies(copies, targetRoot, components.connection?.[connectionName]);
    collectWebhookCopies(
        copies,
        targetRoot,
        components.webhook?.[webhookName],
        connectionName,
    );
    for (const module of supportedModules) {
        collectModuleCopies(copies, targetRoot, module, moduleMap[module.name]);
    }

    const filteredGroups = buildFilteredGroups(moduleMap);
    const groupsPath = safeTarget(targetRoot, manifest.generalCodeFiles?.groups);

    console.log(`${write ? 'Writing' : 'Dry run:'} local Make clone scaffold`);
    console.log(`  Existing modules updated: ${updated.length}`);
    console.log(`  New local modules: ${created.length}`);
    console.log(`  New local webhooks: ${webhookResult.created ? 1 : 0}`);
    console.log(
        `  Deferred special modules: ${
            skippedModules.length > 0
                ? skippedModules.map((module) => module.name).join(', ')
                : 'none'
        }`,
    );
    for (const moduleName of created) console.log(`  + ${moduleName}`);
    console.log(`  Code files mapped: ${copies.length}`);

    if (!write) {
        console.log('No files changed. Re-run with --write after reviewing this inventory.');
        return;
    }

    for (const copy of copies) {
        await access(copy.source);
        await mkdir(dirname(copy.target), { recursive: true });
        await copyFile(copy.source, copy.target);
    }
    for (const module of supportedModules) {
        const codeFiles = moduleMap[module.name].codeFiles;
        for (const key of ['staticParams', 'scope']) {
            const target = safeTarget(targetRoot, codeFiles[key]);
            if (!target) continue;
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, '[]\n', 'utf8');
        }
    }
    const webhookCodeFiles = components.webhook?.[webhookName]?.codeFiles ?? {};
    for (const [key, emptyValue] of [
        ['params', '[]\n'],
        ['update', '{}\n'],
        ['requiredScope', '[]\n'],
    ]) {
        const target = safeTarget(targetRoot, webhookCodeFiles[key]);
        if (!target) continue;
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, emptyValue, 'utf8');
    }
    if (groupsPath) {
        await mkdir(dirname(groupsPath), { recursive: true });
        await writeFile(groupsPath, `${JSON.stringify(filteredGroups, null, 4)}\n`, 'utf8');
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');

    console.log('Scaffold complete. Origin mappings and .secrets were not read or modified.');
}

function findConnectionName(connectionMap) {
    const entry = Object.entries(connectionMap).find(
        ([name, connection]) =>
            name === catalog.connection.name || connection?.label === catalog.connection.label,
    );
    if (!entry) throw new Error(`Connection ${catalog.connection.label} was not found in the clone.`);
    return entry[0];
}

function findWebhookName(webhookMap, moduleMap) {
    const linkedName = moduleMap[catalog.modules.find((module) => module.type === 'instant-trigger')?.name]
        ?.webhook;
    if (linkedName && webhookMap[linkedName]) return linkedName;
    const entry = Object.entries(webhookMap).find(
        ([name, webhook]) => name === catalog.webhook.name || webhook?.label === catalog.webhook.label,
    );
    return entry?.[0];
}

function ensureWebhook(webhookMap, moduleMap, connectionName) {
    const existingName = findWebhookName(webhookMap, moduleMap);
    if (existingName) return { name: existingName, created: false };

    const name = catalog.webhook.name;
    const slug = camelToKebab(name);
    webhookMap[name] = {
        label: catalog.webhook.label,
        webhookType: 'web',
        connection: connectionName,
        altConnection: null,
        codeFiles: webhookCodeFilesFor(slug),
    };
    return { name, created: true };
}

function createModuleEntry(module, connectionName, webhookName) {
    const targetSlug = camelToKebab(module.name);
    const entry = {
        label: module.label,
        description: module.description,
        moduleType: module.type === 'instant-trigger' ? 'instant_trigger' : module.type,
        connection: module.type === 'instant-trigger' ? null : connectionName,
        altConnection: null,
        codeFiles:
            module.type === 'instant-trigger'
                ? instantTriggerCodeFilesFor(targetSlug)
                : codeFilesFor(targetSlug),
    };
    if (module.type === 'action' || module.type === 'search') {
        entry.actionCrud = module.type === 'action' ? module.action : null;
    }
    if (module.type === 'instant-trigger') entry.webhook = webhookName;
    return entry;
}

function applyMetadata(entry, module, connectionName, webhookName) {
    entry.label = module.label;
    entry.description = module.description;
    entry.moduleType = module.type === 'instant-trigger' ? 'instant_trigger' : module.type;
    if (module.type === 'action') {
        entry.actionCrud = module.action;
        entry.connection = connectionName;
    } else if (module.type === 'search') {
        entry.actionCrud = null;
        entry.connection = connectionName;
    } else if (module.type === 'instant-trigger') {
        delete entry.actionCrud;
        entry.connection = null;
        entry.webhook = webhookName;
    } else {
        delete entry.actionCrud;
        entry.connection = connectionName;
    }
    entry.altConnection = null;
    if (!entry.codeFiles) throw new Error(`Existing module ${module.name} has no codeFiles mapping.`);
}

function codeFilesFor(targetSlug) {
    const prefix = `modules/${targetSlug}/${targetSlug}`;
    return {
        communication: `${prefix}.communication.iml.json`,
        staticParams: `${prefix}.static-params.iml.json`,
        mappableParams: `${prefix}.mappable-params.iml.json`,
        interface: `${prefix}.interface.iml.json`,
        samples: `${prefix}.samples.iml.json`,
        scope: `${prefix}.scope.iml.json`,
    };
}

function instantTriggerCodeFilesFor(targetSlug) {
    const files = codeFilesFor(targetSlug);
    delete files.scope;
    return files;
}

function webhookCodeFilesFor(targetSlug) {
    const prefix = `webhooks/${targetSlug}/${targetSlug}`;
    return {
        communication: `${prefix}.communication.iml.json`,
        params: `${prefix}.params.iml.json`,
        attach: `${prefix}.attach.iml.json`,
        detach: `${prefix}.detach.iml.json`,
        update: `${prefix}.update.iml.json`,
        requiredScope: `${prefix}.required-scope.iml.json`,
    };
}

function collectConnectionCopies(copies, targetRoot, connection) {
    if (!connection?.codeFiles) throw new Error('The Zvid connection has no codeFiles mapping.');
    addCopy(
        copies,
        targetRoot,
        `connections/${catalog.connection.source}/communication.iml.json`,
        connection.codeFiles.communication,
    );
    addCopy(
        copies,
        targetRoot,
        `connections/${catalog.connection.source}/params.iml.json`,
        connection.codeFiles.params,
    );
}

function collectWebhookCopies(copies, targetRoot, webhook, connectionName) {
    if (!webhook?.codeFiles) throw new Error('The Zvid webhook has no codeFiles mapping.');
    webhook.label = catalog.webhook.label;
    webhook.webhookType = webhook.webhookType ?? 'web';
    webhook.connection = connectionName;
    webhook.altConnection = null;
    for (const key of ['communication', 'attach', 'detach']) {
        addCopy(
            copies,
            targetRoot,
            `webhooks/${catalog.webhook.source}/${key}.iml.json`,
            webhook.codeFiles[key],
        );
    }
}

function collectModuleCopies(copies, targetRoot, module, entry) {
    const mappings = {
        communication: 'communication.iml.json',
        mappableParams: 'mappable-params.iml.json',
        interface: 'interface.iml.json',
        samples: 'samples.iml.json',
    };
    for (const [key, filename] of Object.entries(mappings)) {
        addCopy(
            copies,
            targetRoot,
            `modules/${module.source}/${filename}`,
            entry.codeFiles[key],
        );
    }
}

function buildFilteredGroups(moduleMap) {
    const available = new Set(Object.keys(moduleMap));
    return [
        {
            label: 'Renders',
            modules: catalog.modules
                .filter((module) => module.group === 'Renders' && available.has(module.name))
                .map((module) => module.name),
        },
        {
            label: 'Templates',
            modules: catalog.modules
                .filter((module) => module.group === 'Templates' && available.has(module.name))
                .map((module) => module.name),
        },
        {
            label: 'AI Authoring',
            modules: catalog.modules
                .filter((module) => module.group === 'AI Authoring' && available.has(module.name))
                .map((module) => module.name),
        },
        {
            label: 'Creative Library',
            modules: catalog.modules
                .filter((module) => module.group === 'Creative Library' && available.has(module.name))
                .map((module) => module.name),
        },
        {
            label: 'Stock Library',
            modules: catalog.modules
                .filter((module) => module.group === 'Stock Library' && available.has(module.name))
                .map((module) => module.name),
        },
        {
            label: 'Account',
            modules: catalog.modules
                .filter((module) => module.group === 'Account' && available.has(module.name))
                .map((module) => module.name),
        },
    ].filter((group) => group.modules.length > 0);
}

function addCopy(copies, targetRoot, sourceRelative, targetRelative) {
    const target = safeTarget(targetRoot, targetRelative);
    if (!target) return;
    copies.push({ source: resolve(sourceRoot, sourceRelative), target });
}

function safeTarget(targetRoot, targetRelative) {
    if (!targetRelative) return undefined;
    if (isAbsolute(targetRelative)) throw new Error(`Refusing absolute manifest path: ${targetRelative}`);
    const target = resolve(targetRoot, targetRelative);
    const relativeTarget = relative(targetRoot, target);
    if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
        throw new Error(`Refusing manifest path outside the Make clone: ${targetRelative}`);
    }
    return target;
}

function camelToKebab(value) {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
