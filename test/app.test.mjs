import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src', 'zvid');
const modulesRoot = join(sourceRoot, 'modules');
const execFileAsync = promisify(execFile);

async function readJson(...parts) {
    return JSON.parse(await readFile(join(root, ...parts), 'utf8'));
}

async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) paths.push(...(await walk(path)));
        else paths.push(path);
    }
    return paths;
}

function visitObjects(value, visitor) {
    if (Array.isArray(value)) {
        for (const entry of value) visitObjects(entry, visitor);
        return;
    }
    if (!value || typeof value !== 'object') return;
    visitor(value);
    for (const child of Object.values(value)) visitObjects(child, visitor);
}

function sentenceCase(label) {
    return label
        .split(' ')
        .map((word, index) => {
            if (index === 0) return word;
            const core = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
            if (/^[A-Z]{2,}s?$/.test(core) || core === 'SaaS' || core === 'Zvid') return word;
            return word.toLowerCase();
        })
        .join(' ');
}

test('every committed IML file is valid JSON', async () => {
    const files = (await walk(sourceRoot)).filter((path) => path.endsWith('.json'));
    assert.ok(files.length > 0);
    for (const path of files) {
        const content = await readFile(path, 'utf8');
        assert.doesNotThrow(() => JSON.parse(content), path);
    }
});

test('IML expressions use supported boolean operators', async () => {
    const files = (await walk(sourceRoot)).filter((path) => path.endsWith('.json'));
    for (const path of files) {
        const content = await readFile(path, 'utf8');
        assert.doesNotMatch(
            content,
            /\b(?:or|and|not)\s*\(/,
            `${path} calls a nonexistent boolean helper; use ||, &&, or !`,
        );
    }
});

test('the catalog, groups, and module directories stay in sync', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    const groups = await readJson('src', 'zvid', 'modules', 'groups.json');
    const directories = (await readdir(modulesRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    const catalogNames = catalog.modules.map((module) => module.name).sort();
    const catalogSources = catalog.modules.map((module) => module.source).sort();
    const groupNames = groups.flatMap((group) => group.modules).sort();

    assert.deepEqual(catalogSources, directories);
    assert.deepEqual(groupNames, catalogNames);
    assert.equal(new Set(groupNames).size, groupNames.length, 'a module appears in more than one group');
    for (const name of catalogNames) {
        assert.match(name, /^[a-zA-Z][0-9a-zA-Z]+[0-9a-zA-Z]$/, `${name} is not a valid Make module name`);
        assert.ok(name.length >= 3 && name.length <= 48, `${name} is outside Make's name length limits`);
    }
    for (const name of [catalog.connection.name, catalog.webhook.name]) {
        assert.match(name, /^[a-zA-Z][0-9a-zA-Z]+[0-9a-zA-Z]$/, `${name} is not a valid Make component name`);
        assert.ok(name.length >= 3 && name.length <= 48, `${name} is outside Make's name length limits`);
    }
    assert.equal(catalog.defaults.connection, catalog.connection.name);
    assert.equal(catalog.webhook.connection, catalog.connection.name);
    const universal = catalog.modules.find((module) => module.type === 'universal');
    assert.equal(universal.label, 'Make an API Call');
    assert.equal(universal.description, 'Performs an arbitrary authorized API call.');
});

test('all modules have communication where needed, a static interface, and a sample', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    for (const module of catalog.modules) {
        const files = new Set(await readdir(join(modulesRoot, module.source)));
        assert.ok(files.has('interface.iml.json'), `${module.name} has no interface`);
        assert.ok(files.has('samples.iml.json'), `${module.name} has no sample`);
        if (module.type !== 'instant-trigger') {
            assert.ok(files.has('communication.iml.json'), `${module.name} has no communication`);
        }
        const interfaceFields = await readJson(
            'src',
            'zvid',
            'modules',
            module.source,
            'interface.iml.json',
        );
        const sample = await readJson(
            'src',
            'zvid',
            'modules',
            module.source,
            'samples.iml.json',
        );
        assert.deepEqual(
            Object.keys(sample).sort(),
            interfaceFields.map((field) => field.name).sort(),
            `${module.name} sample and interface fields differ`,
        );
        visitObjects(interfaceFields, (field) => {
            if (field.name) {
                assert.match(
                    field.name,
                    /^[a-z][0-9a-zA-Z]*$/,
                    `${module.name} output field ${field.name} is not camelCase`,
                );
            }
        });
    }
});

test('parameter and interface fields follow Make type and label conventions', async () => {
    const allowedTypes = new Set([
        'array',
        'boolean',
        'buffer',
        'cert',
        'collection',
        'color',
        'date',
        'email',
        'file',
        'filename',
        'filter',
        'folder',
        'hidden',
        'integer',
        'json',
        'number',
        'password',
        'path',
        'pkey',
        'port',
        'select',
        'text',
        'time',
        'timestamp',
        'timezone',
        'uinteger',
        'url',
        'uuid',
    ]);
    const parameterFiles = (await walk(sourceRoot)).filter(
        (path) =>
            path.endsWith('interface.iml.json') ||
            path.endsWith('mappable-params.iml.json') ||
            path.endsWith('params.iml.json'),
    );

    for (const path of parameterFiles) {
        const parameters = JSON.parse(await readFile(path, 'utf8'));
        visitObjects(parameters, (parameter) => {
            if (parameter.type) {
                assert.ok(
                    allowedTypes.has(parameter.type),
                    `${path}: ${parameter.name ?? '<unnamed>'} uses unsupported type ${parameter.type}`,
                );
                if (parameter.type === 'collection') {
                    assert.ok(
                        Array.isArray(parameter.spec),
                        `${path}: ${parameter.name ?? '<unnamed>'} has no collection spec`,
                    );
                }
            }
            if (typeof parameter.label === 'string') {
                assert.equal(
                    parameter.label,
                    sentenceCase(parameter.label),
                    `${path}: ${parameter.label} is not sentence case`,
                );
            }
        });
    }
});

test('search modules implement Make limit and pagination conventions', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    for (const module of catalog.modules.filter((item) => item.type === 'search')) {
        const params = await readJson('src', 'zvid', 'modules', module.source, 'mappable-params.iml.json');
        const communication = await readJson(
            'src',
            'zvid',
            'modules',
            module.source,
            'communication.iml.json',
        );
        const limit = params.find((parameter) => parameter.name === 'limit');

        assert.ok(limit, `${module.name} has no Limit parameter`);
        assert.equal(params.at(-1).name, 'limit', `${module.name} Limit must be the last standard field`);
        assert.notEqual(limit.required, true, `${module.name} Limit must be optional`);
        assert.equal(limit.default, 10, `${module.name} Limit default must be 10`);
        assert.match(limit.help, /help\.make\.com\/types-of-modules/);
        assert.equal(communication.response.limit, '{{parameters.limit}}');
        assert.ok(communication.response.iterate, `${module.name} does not iterate results`);
        assert.ok(communication.pagination, `${module.name} has no pagination directive`);
        assert.ok(communication.pagination.condition, `${module.name} has no pagination stop condition`);
    }
});

test('base and connection protect credentials and classify common errors', async () => {
    const base = await readJson('src', 'zvid', 'general', 'base.iml.json');
    const connection = await readJson(
        'src',
        'zvid',
        'connections',
        'zvid-api-key',
        'communication.iml.json',
    );

    assert.equal(base.baseUrl, 'https://api.zvid.io');
    assert.equal(base.headers['x-api-key'], '{{connection.apiKey}}');
    assert.ok(base.log.sanitize.includes('request.headers.x-api-key'));
    assert.equal(base.response.error['401'].type, 'InvalidAccessTokenError');
    assert.equal(base.response.error['429'].type, 'RateLimitError');
    assert.equal(connection.url, 'https://api.zvid.io/api/user/profile');
    assert.ok(connection.log.sanitize.includes('request.headers.x-api-key'));
});

test('the universal module cannot target an absolute external URL', async () => {
    const communication = await readJson(
        'src',
        'zvid',
        'modules',
        'make-an-api-call',
        'communication.iml.json',
    );
    assert.equal(communication.url, '/{{parameters.url}}');
    assert.ok(!communication.url.startsWith('{{parameters.url}}'));
});

test('the universal module replaces raw HTML 404 pages with a readable error', async () => {
    const communication = await readJson(
        'src',
        'zvid',
        'modules',
        'make-an-api-call',
        'communication.iml.json',
    );

    assert.equal(
        communication.response.error['404'].message,
        '[404] The requested Zvid API route was not found.',
    );
});

test('Make covers the current n8n operation surface', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    const sources = new Set(catalog.modules.map((module) => module.source));
    const parityModules = [
        'plan-creative-video',
        'get-project-schema',
        'list-supported-elements',
        'get-element-docs',
        'get-example-project',
        'repair-project',
        'search-creative-library',
        'get-creative-asset',
        'get-creative-asset-content',
        'search-stock-media',
        'get-stock-library-availability',
        'create-render',
        'create-bulk-render',
        'get-render',
        'get-bulk-render',
        'list-renders',
        'validate-render',
        'list-templates',
        'get-template',
        'create-template',
        'update-template',
        'delete-template',
        'duplicate-template',
        'preview-template',
        'render-from-template',
        'get-credit-balance',
    ];
    for (const module of parityModules) assert.ok(sources.has(module), `missing parity module ${module}`);
});

test('project JSON render modules accept variables for placeholder resolution', async () => {
    for (const source of ['create-render', 'create-bulk-render', 'validate-render']) {
        const params = await readJson('src', 'zvid', 'modules', source, 'mappable-params.iml.json');
        const sourceParameter = params.find((parameter) => parameter.name === 'source');
        const projectOption = sourceParameter.options.find((option) => option.value === 'json');
        assert.ok(
            projectOption.nested.some((parameter) => parameter.name === 'variables'),
            `${source} cannot resolve variables with project JSON`,
        );
        const communication = await readJson(
            'src',
            'zvid',
            'modules',
            source,
            'communication.iml.json',
        );
        assert.equal(communication.body.variables, '{{ifempty(parameters.variables, undefined)}}');
    }
});

test('template detail modules expose concrete output fields for downstream mapping', async () => {
    for (const source of [
        'create-template',
        'get-template',
        'update-template',
        'duplicate-template',
    ]) {
        const communication = await readJson(
            'src',
            'zvid',
            'modules',
            source,
            'communication.iml.json',
        );
        assert.equal(typeof communication.response.output, 'object');
        assert.equal(communication.response.output.id, '{{body.template.id}}');
        assert.equal(communication.response.output.project, '{{body.template.project}}');
        assert.equal(
            communication.response.output.variablesSummary,
            '{{body.template.variablesSummary}}',
        );
    }
});

test('render validation treats API validation errors as normal module output', async () => {
    const communication = await readJson(
        'src',
        'zvid',
        'modules',
        'validate-render',
        'communication.iml.json',
    );

    assert.equal(communication.response.valid.condition, '{{statusCode = 200 || statusCode = 400}}');
    assert.equal(communication.response.output.valid, '{{if(statusCode = 200, true, false)}}');
    assert.equal(communication.response.output.errors, '{{body.details}}');
});

test('public source uses canonical Zvid URLs and does not expose stock implementation details', async () => {
    const publicFiles = [
        join(root, 'README.md'),
        join(root, 'submission', 'module-catalog.json'),
        ...(await walk(sourceRoot)).filter((path) => !path.endsWith('communication.iml.json')),
    ];
    const text = (await Promise.all(publicFiles.map((path) => readFile(path, 'utf8')))).join('\n');
    const forbiddenStockNames = ['pexels', 'pixabay', 'unsplash', 'giphy', 'jamendo'];

    assert.ok(!text.includes('dashboard.zvid.io'));
    assert.ok(!text.includes('\uFFFD'), 'replacement characters found in public copy');
    for (const name of forbiddenStockNames) {
        assert.ok(!text.toLowerCase().includes(name), 'public copy exposes a stock implementation detail');
    }
});

test('webhook deliveries fail closed when the signature cannot be verified', async () => {
    const webhook = await readJson(
        'src',
        'zvid',
        'webhooks',
        'render-events',
        'communication.iml.json',
    );
    assert.match(webhook.condition, /sha256/);
    assert.match(webhook.condition, /createJSON\(body\)/);
    assert.match(webhook.condition, /data\.secret/);
    assert.ok(!webhook.condition.includes('webhook.secret'));
    assert.ok(!webhook.condition.includes('json(body)'));
    assert.deepEqual(Object.keys(webhook.output), ['event', 'jobId', 'timestamp', 'test', 'data']);
    assert.ok(!webhook.condition.includes(', true)'), 'signature verification falls back to accepting a request');
});

test('webhook attach persists the endpoint id and signing secret returned by Zvid', async () => {
    const attach = await readJson(
        'src',
        'zvid',
        'webhooks',
        'render-events',
        'attach.iml.json',
    );

    assert.equal(attach.response.data.externalHookId, '{{body.id}}');
    assert.equal(attach.response.data.secret, '{{body.secret}}');
});

test('the clone synchronizer follows generated makecomapp.json paths', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    const targetRoot = await mkdtemp(join(tmpdir(), 'zvid-make-sync-'));
    const moduleComponents = {};

    try {
        for (const module of catalog.modules) {
            const files = new Set(await readdir(join(modulesRoot, module.source)));
            const codeFiles = {};
            if (files.has('communication.iml.json')) {
                codeFiles.communication = `generated/${module.name}.communication.json`;
            }
            if (files.has('mappable-params.iml.json')) {
                codeFiles.mappableParameters = `generated/${module.name}.expect.json`;
            }
            codeFiles.interface = `generated/${module.name}.interface.json`;
            codeFiles.samples = `generated/${module.name}.samples.json`;
            moduleComponents[module.name] = { codeFiles };
        }

        const manifest = {
            fileVersion: 1,
            generalCodeFiles: {
                base: 'generated/base.json',
                readme: 'generated/README.md',
                groups: 'generated/groups.json',
            },
            components: {
                connection: {
                    zvidApiKey: {
                        label: catalog.connection.label,
                        codeFiles: {
                            communication: 'generated/connection.communication.json',
                            params: 'generated/connection.params.json',
                        },
                    },
                },
                module: moduleComponents,
                webhook: {
                    renderEvents: {
                        label: catalog.webhook.label,
                        codeFiles: {
                            communication: 'generated/webhook.communication.json',
                            attach: 'generated/webhook.attach.json',
                            detach: 'generated/webhook.detach.json',
                        },
                    },
                },
            },
        };
        const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
        await writeFile(join(targetRoot, 'makecomapp.json'), manifestText);

        await execFileAsync(
            process.execPath,
            [join(root, 'scripts', 'sync-to-clone.mjs'), targetRoot, '--write'],
            { cwd: root },
        );

        assert.equal(
            await readFile(join(targetRoot, 'generated', 'base.json'), 'utf8'),
            await readFile(join(sourceRoot, 'general', 'base.iml.json'), 'utf8'),
        );
        assert.equal(
            await readFile(join(targetRoot, 'generated', 'README.md'), 'utf8'),
            await readFile(join(sourceRoot, 'README.md'), 'utf8'),
        );
        assert.equal(
            await readFile(join(targetRoot, 'generated', 'createRender.communication.json'), 'utf8'),
            await readFile(
                join(modulesRoot, 'create-render', 'communication.iml.json'),
                'utf8',
            ),
        );
        assert.equal(await readFile(join(targetRoot, 'makecomapp.json'), 'utf8'), manifestText);
    } finally {
        await rm(targetRoot, { recursive: true, force: true });
    }
});

test('the clone scaffolder preserves Make IDs and builds the complete app', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    const targetRoot = await mkdtemp(join(tmpdir(), 'zvid-make-scaffold-'));
    const origins = [
        {
            label: 'Origin',
            baseUrl: 'https://eu1.make.com/api',
            appId: 'private-zvid-test',
            appVersion: 1,
            idMapping: {
                connection: [{ local: 'connection1', remote: 'private-zvid-test' }],
                module: [
                    { local: 'createRender', remote: 'createRender' },
                    { local: 'makeAnApiCall', remote: 'makeAnApiCall' },
                    { local: 'watchRenderEvents', remote: 'watchRenderEvents' },
                ],
                function: [],
                rpc: [],
                webhook: [{ local: 'webhook1', remote: 'private-zvid-test' }],
                endpoint: [],
            },
            apikeyFile: '../.secrets/apikey',
        },
    ];
    const standardFiles = (slug) => ({
        communication: `modules/${slug}/${slug}.communication.iml.json`,
        staticParams: `modules/${slug}/${slug}.static-params.iml.json`,
        mappableParams: `modules/${slug}/${slug}.mappable-params.iml.json`,
        interface: `modules/${slug}/${slug}.interface.iml.json`,
        samples: `modules/${slug}/${slug}.samples.iml.json`,
        scope: `modules/${slug}/${slug}.scope.iml.json`,
    });
    const manifest = {
        fileVersion: 1,
        generalCodeFiles: {
            base: 'general/base.iml.json',
            readme: 'README.md',
            groups: 'modules/groups.json',
        },
        components: {
            connection: {
                connection1: {
                    label: catalog.connection.label,
                    codeFiles: {
                        communication: 'connections/connection1/connection1.communication.iml.json',
                        params: 'connections/connection1/connection1.params.iml.json',
                    },
                },
            },
            module: {
                createRender: {
                    label: 'Create render',
                    moduleType: 'action',
                    connection: 'connection1',
                    codeFiles: standardFiles('create-render'),
                },
                makeAnApiCall: {
                    label: 'Make an API Call',
                    moduleType: 'universal',
                    connection: 'connection1',
                    codeFiles: standardFiles('make-an-api-call'),
                },
                watchRenderEvents: {
                    label: 'Watch render events',
                    moduleType: 'instant_trigger',
                    connection: null,
                    webhook: 'webhook1',
                    codeFiles: {
                        communication:
                            'modules/watch-render-events/watch-render-events.communication.iml.json',
                        staticParams:
                            'modules/watch-render-events/watch-render-events.static-params.iml.json',
                        mappableParams:
                            'modules/watch-render-events/watch-render-events.mappable-params.iml.json',
                        interface:
                            'modules/watch-render-events/watch-render-events.interface.iml.json',
                        samples: 'modules/watch-render-events/watch-render-events.samples.iml.json',
                    },
                },
            },
            webhook: {
                webhook1: {
                    label: 'Render events',
                    webhookType: 'web',
                    connection: 'connection1',
                    codeFiles: {
                        communication: 'webhooks/webhook1/webhook1.communication.iml.json',
                        params: 'webhooks/webhook1/webhook1.params.iml.json',
                        attach: 'webhooks/webhook1/webhook1.attach.iml.json',
                        detach: 'webhooks/webhook1/webhook1.detach.iml.json',
                        update: 'webhooks/webhook1/webhook1.update.iml.json',
                        requiredScope: 'webhooks/webhook1/webhook1.required-scope.iml.json',
                    },
                },
            },
        },
        origins,
    };

    try {
        await writeFile(join(targetRoot, 'makecomapp.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        await execFileAsync(
            process.execPath,
            [join(root, 'scripts', 'scaffold-local-clone.mjs'), targetRoot, '--write'],
            { cwd: root },
        );

        const scaffolded = JSON.parse(await readFile(join(targetRoot, 'makecomapp.json'), 'utf8'));
        const modules = scaffolded.components.module;
        const webhook = scaffolded.components.webhook.webhook1;
        const groupedModules = JSON.parse(
            await readFile(join(targetRoot, scaffolded.generalCodeFiles.groups), 'utf8'),
        ).flatMap((group) => group.modules);

        assert.deepEqual(scaffolded.origins, origins, 'remote component IDs must be preserved');
        assert.equal(
            await readFile(join(targetRoot, scaffolded.generalCodeFiles.readme), 'utf8'),
            await readFile(join(sourceRoot, 'README.md'), 'utf8'),
        );
        assert.equal(Object.keys(modules).length, catalog.modules.length);
        assert.deepEqual(new Set(groupedModules), new Set(catalog.modules.map((module) => module.name)));
        assert.equal(modules.watchRenderEvents.moduleType, 'instant_trigger');
        assert.equal(modules.watchRenderEvents.connection, null);
        assert.equal(modules.watchRenderEvents.webhook, 'webhook1');
        assert.equal(modules.makeAnApiCall.moduleType, 'universal');
        assert.equal(webhook.label, catalog.webhook.label);
        assert.equal(webhook.webhookType, 'web');
        assert.equal(webhook.connection, 'connection1');
        assert.equal(
            await readFile(join(targetRoot, webhook.codeFiles.attach), 'utf8'),
            await readFile(join(sourceRoot, 'webhooks', catalog.webhook.source, 'attach.iml.json'), 'utf8'),
        );
        assert.equal(await readFile(join(targetRoot, webhook.codeFiles.params), 'utf8'), '[]\n');
        assert.equal(await readFile(join(targetRoot, webhook.codeFiles.update), 'utf8'), '{}\n');
        assert.equal(await readFile(join(targetRoot, webhook.codeFiles.requiredScope), 'utf8'), '[]\n');

        for (const component of [
            ...Object.values(modules),
            ...Object.values(scaffolded.components.connection),
            ...Object.values(scaffolded.components.webhook),
        ]) {
            for (const codePath of Object.values(component.codeFiles ?? {})) {
                assert.ok(await readFile(join(targetRoot, codePath), 'utf8'), `${codePath} is empty`);
            }
        }
    } finally {
        await rm(targetRoot, { recursive: true, force: true });
    }
});

test('the clone scaffolder can create the webhook and instant trigger locally', async () => {
    const catalog = await readJson('submission', 'module-catalog.json');
    const targetRoot = await mkdtemp(join(tmpdir(), 'zvid-make-scaffold-special-'));
    const manifest = {
        fileVersion: 1,
        generalCodeFiles: {
            base: 'general/base.iml.json',
            groups: 'modules/groups.json',
        },
        components: {
            connection: {
                connection1: {
                    label: catalog.connection.label,
                    codeFiles: {
                        communication: 'connections/connection1/communication.iml.json',
                        params: 'connections/connection1/params.iml.json',
                    },
                },
            },
            module: {},
        },
        origins: [
            {
                label: 'Origin',
                idMapping: {
                    connection: [{ local: 'connection1', remote: 'private-zvid-test' }],
                    module: [],
                    webhook: [],
                },
                apikeyFile: '../.secrets/apikey',
            },
        ],
    };

    try {
        await writeFile(join(targetRoot, 'makecomapp.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        await execFileAsync(
            process.execPath,
            [join(root, 'scripts', 'scaffold-local-clone.mjs'), targetRoot, '--write'],
            { cwd: root },
        );

        const scaffolded = JSON.parse(await readFile(join(targetRoot, 'makecomapp.json'), 'utf8'));
        const webhook = scaffolded.components.webhook[catalog.webhook.name];
        const trigger = scaffolded.components.module.watchRenderEvents;
        assert.equal(Object.keys(scaffolded.components.module).length, catalog.modules.length);
        assert.equal(webhook.label, catalog.webhook.label);
        assert.equal(webhook.connection, 'connection1');
        assert.equal(trigger.moduleType, 'instant_trigger');
        assert.equal(trigger.webhook, catalog.webhook.name);
        assert.equal(trigger.connection, null);
        assert.equal(
            await readFile(join(targetRoot, webhook.codeFiles.communication), 'utf8'),
            await readFile(
                join(sourceRoot, 'webhooks', catalog.webhook.source, 'communication.iml.json'),
                'utf8',
            ),
        );
        assert.deepEqual(scaffolded.origins, manifest.origins);
    } finally {
        await rm(targetRoot, { recursive: true, force: true });
    }
});

test('the production smoke runner documents its safe modes without requiring a key', async () => {
    const packageJson = await readJson('package.json');
    assert.equal(packageJson.scripts['test:production'], 'node scripts/smoke-production.mjs');
    assert.equal(
        packageJson.scripts['test:production:render'],
        'node scripts/smoke-production.mjs --render',
    );

    const { stdout } = await execFileAsync(
        process.execPath,
        [join(root, 'scripts', 'smoke-production.mjs'), '--help'],
        { cwd: root, env: { ...process.env, ZVID_API_KEY: '' } },
    );
    assert.match(stdout, /free\/read-only/);
    assert.match(stdout, /--render/);
    assert.match(stdout, /spend credits/);
    assert.match(stdout, /never prints it/);
});

test('the private Make smoke-test fixture is valid image project JSON', async () => {
    const fixture = await readJson('submission', 'fixtures', 'still-image-project.json');
    assert.equal(fixture.type, 'image');
    assert.equal(fixture.outputFormat, 'png');
    assert.ok(Array.isArray(fixture.visuals));
    assert.ok(fixture.visuals.length > 0);
});
