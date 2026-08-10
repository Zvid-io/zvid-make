import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
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
    console.error('Usage: npm run sync -- <path-to-private-make-clone> [--write]');
    console.error('The command is a dry run unless --write is supplied.');
    process.exitCode = 1;
} else {
    await syncClone(resolve(targetArgument));
}

async function syncClone(targetRoot) {
    const manifestPath = resolve(targetRoot, 'makecomapp.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const components = manifest.components ?? {};

    const selectedComponents = selectComponentInventory(components);

    const copies = [];
    addCopy(copies, targetRoot, 'general/base.iml.json', manifest.generalCodeFiles?.base);
    addCopy(copies, targetRoot, 'modules/groups.json', manifest.generalCodeFiles?.groups);

    collectComponentCopies(copies, targetRoot, 'connection', selectedComponents.connection);
    collectComponentCopies(copies, targetRoot, 'module', selectedComponents.module);
    collectComponentCopies(copies, targetRoot, 'webhook', selectedComponents.webhook);

    if (copies.length === 0) throw new Error('No mapped Make code files were found in makecomapp.json.');

    console.log(`${write ? 'Writing' : 'Dry run:'} ${copies.length} mapped code files`);
    for (const copy of copies) {
        await access(copy.source);
        console.log(`${relative(repositoryRoot, copy.source)} -> ${relative(targetRoot, copy.target)}`);
        if (write) {
            await mkdir(dirname(copy.target), { recursive: true });
            await copyFile(copy.source, copy.target);
        }
    }

    if (!write) {
        console.log('No files changed. Re-run with --write after checking the mapping.');
    } else {
        console.log('Sync complete. makecomapp.json and .secrets were not modified.');
    }
}

function selectComponentInventory(components) {
    const moduleMap = components.module ?? {};
    const missingModules = catalog.modules
        .map((module) => module.name)
        .filter((name) => !moduleMap[name]);
    if (missingModules.length > 0) {
        throw new Error(`The private Make clone is missing modules: ${missingModules.join(', ')}`);
    }
    const connectionEntry = findNamedOrLabeledComponent(
        components.connection ?? {},
        catalog.connection,
    );
    if (!connectionEntry) {
        throw new Error(`The private Make clone is missing connection ${catalog.connection.name}.`);
    }
    const webhookEntry = findNamedOrLabeledComponent(components.webhook ?? {}, catalog.webhook);
    if (!webhookEntry) {
        throw new Error(`The private Make clone is missing webhook ${catalog.webhook.name}.`);
    }
    return {
        connection: Object.fromEntries([connectionEntry]),
        module: Object.fromEntries(catalog.modules.map((module) => [module.name, moduleMap[module.name]])),
        webhook: Object.fromEntries([webhookEntry]),
    };
}

function findNamedOrLabeledComponent(componentMap, expected) {
    if (componentMap[expected.name]) return [expected.name, componentMap[expected.name]];
    return Object.entries(componentMap).find(([, component]) => component?.label === expected.label);
}

function collectComponentCopies(copies, targetRoot, componentType, componentMap) {
    for (const [name, component] of Object.entries(componentMap)) {
        if (!component?.codeFiles) {
            throw new Error(
                `Component ${componentType}/${name} has no local code-file mapping. Pull or clone it from Make again.`,
            );
        }
        const sourceName = componentSourceName(componentType, name);
        for (const [codeKey, targetRelative] of Object.entries(component.codeFiles)) {
            if (!targetRelative) continue;
            const sourceFile = sourceFileFor(componentType, sourceName, codeKey);
            if (sourceFile) addCopy(copies, targetRoot, sourceFile, targetRelative);
        }
    }
}

function componentSourceName(componentType, platformName) {
    if (componentType === 'module') {
        const module = catalog.modules.find((item) => item.name === platformName);
        if (!module) throw new Error(`No source mapping for Make module ${platformName}.`);
        return module.source;
    }
    if (componentType === 'connection') return catalog.connection.source;
    if (componentType === 'webhook') return catalog.webhook.source;
    throw new Error(`Unsupported Make component type ${componentType}.`);
}

function sourceFileFor(componentType, name, codeKey) {
    const normalized = codeKey.toLowerCase().replaceAll(/[^a-z]/g, '');
    const commonNames = {
        communication: 'communication.iml.json',
        interface: 'interface.iml.json',
        sample: 'samples.iml.json',
        samples: 'samples.iml.json',
    };

    if (componentType === 'connection') {
        const filename = normalized === 'params' ? 'params.iml.json' : commonNames[normalized];
        return filename ? `connections/${name}/${filename}` : undefined;
    }
    if (componentType === 'module') {
        const filename =
            normalized === 'expect' ||
            normalized === 'mappableparams' ||
            normalized === 'mappableparameters'
                ? 'mappable-params.iml.json'
                : commonNames[normalized];
        return filename ? `modules/${name}/${filename}` : undefined;
    }
    if (componentType === 'webhook') {
        const filename =
            normalized === 'attach' || normalized === 'detach'
                ? `${normalized}.iml.json`
                : commonNames[normalized];
        return filename ? `webhooks/${name}/${filename}` : undefined;
    }
    return undefined;
}

function addCopy(copies, targetRoot, sourceRelative, targetRelative) {
    if (!targetRelative) return;
    if (isAbsolute(targetRelative)) {
        throw new Error(`Refusing absolute manifest path: ${targetRelative}`);
    }
    const source = resolve(sourceRoot, sourceRelative);
    const target = resolve(targetRoot, targetRelative);
    const relativeTarget = relative(targetRoot, target);
    if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
        throw new Error(`Refusing manifest path outside the Make clone: ${targetRelative}`);
    }
    copies.push({ source, target });
}
