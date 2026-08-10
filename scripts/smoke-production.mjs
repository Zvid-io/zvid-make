import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_BASE_URL = 'https://api.zvid.io';
const args = process.argv.slice(2);

if (args.includes('--help')) {
    printHelp();
    process.exit(0);
}

const unknownOptions = args.filter(
    (argument, index) =>
        argument.startsWith('--') &&
        argument !== '--render' &&
        argument !== '--project' &&
        args[index - 1] !== '--project',
);
if (unknownOptions.length > 0) {
    fail(`Unknown option: ${unknownOptions[0]}`);
}

const render = args.includes('--render');
const projectIndex = args.indexOf('--project');
const projectPath = projectIndex === -1 ? undefined : args[projectIndex + 1];
if (projectIndex !== -1 && (!projectPath || projectPath.startsWith('--'))) {
    fail('--project requires a path to a JSON file.');
}

const apiKey = process.env.ZVID_API_KEY?.trim();
if (!apiKey) {
    fail('ZVID_API_KEY is not set. See README.md for the safe PowerShell command.');
}

console.log(`Zvid production API smoke test${render ? ' (paid render enabled)' : ' (free/read-only)'}`);
console.log(`API: ${API_BASE_URL}`);

const profile = await request('Connection authentication', '/api/user/profile');
expectObject('Connection authentication', profile);

const balance = await request('Get credit balance', '/api/credits/balance');
expectObject('Get credit balance', balance);

const schema = await request('Get project schema', '/api/render/schema/api-key?target=project');
expectObject('Get project schema', schema);

const elements = await request('List supported elements', '/api/render/elements/api-key');
expectArrayProperty('List supported elements', elements, 'elements');

const elementDocs = await request(
    'Get element documentation',
    '/api/render/elements/TEXT/api-key',
);
expectObjectProperty('Get element documentation', elementDocs, 'element');

const exampleResponse = await request(
    'Get example project',
    '/api/render/examples/api-key?name=still-image',
);
expectObjectProperty('Get example project', exampleResponse, 'example');

const project = projectPath
    ? await readProject(projectPath)
    : exampleResponse.example?.payload;
expectObject('Project selected for validation', project);

const repaired = await request('Repair project JSON', '/api/render/repair/api-key', {
    method: 'POST',
    body: { payload: project },
});
expectObject('Repair project JSON', repaired);

const plan = await request('Plan a creative video', '/api/render/creative-plan/api-key', {
    method: 'POST',
    body: {
        brief: 'A short synthetic product announcement used only for integration testing.',
        variationMode: 'consistent',
        variationSeed: 'make-local-smoke-test',
        aspectRatio: '1:1',
        duration: 5,
        style: 'minimal',
        preferredMedia: 'image',
    },
});
expectObject('Plan a creative video', plan);

const library = await request(
    'Search creative assets',
    '/api/library/examples?limit=1&offset=0',
);
expectArrayProperty('Search creative assets', library, 'items');

const availability = await request(
    'Get stock library availability',
    '/api/stock/providers',
);
expectObject('Get stock library availability', availability);

const templates = await request('List templates', '/api/templates?limit=1&page=1');
expectArrayProperty('List templates', templates, 'templates');

const jobs = await request('Search renders', '/api/jobs?limit=1&page=1');
expectArrayProperty('Search renders', jobs, 'jobs');

const validation = await request('Validate a render payload', '/api/render/validate/api-key', {
    method: 'POST',
    body: { payload: project },
});
if (validation?.valid !== true || !validation.payload) {
    throw new Error('Validate a render payload returned an unexpected response.');
}

if (!render) {
    console.log('\nPASS: production authentication and free/read-only API contracts are healthy.');
    console.log('No render was submitted and no render credits were spent.');
    console.log('Next: deploy the private app and run the same modules in Make Scenario Builder.');
    process.exit(0);
}

const renderType = validation.payload.type === 'image' ? 'image' : 'video';
const renderPath =
    renderType === 'image' ? '/api/render/image/api-key' : '/api/render/api-key';
const submitted = await request(`Create a ${renderType} render`, renderPath, {
    method: 'POST',
    body: { payload: validation.payload },
    expectedStatuses: [202],
});
if (!submitted?.jobId) throw new Error('Render submission did not return a jobId.');

console.log(`  Job: ${submitted.jobId}`);
const completed = await waitForRender(submitted.jobId);
if (completed.state !== 'completed') {
    throw new Error(`Render ended with state "${completed.state}".`);
}

console.log('\nPASS: the production smoke test submitted and completed a render.');
console.log('This verifies the Zvid API contract; execute the private module in Make for Make-runtime coverage.');

async function request(label, path, options = {}) {
    const method = options.method ?? 'GET';
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
            accept: 'application/json',
            'x-api-key': apiKey,
            ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { message: text.slice(0, 500) };
    }

    const expectedStatuses = options.expectedStatuses ?? [];
    if (!response.ok && !expectedStatuses.includes(response.status)) {
        const message = body?.message ?? body?.error ?? response.statusText;
        throw new Error(`${label} failed (HTTP ${response.status}): ${String(message).slice(0, 500)}`);
    }
    if (expectedStatuses.length > 0 && !expectedStatuses.includes(response.status)) {
        throw new Error(
            `${label} returned HTTP ${response.status}; expected ${expectedStatuses.join(' or ')}.`,
        );
    }
    console.log(`  OK  ${label} (HTTP ${response.status})`);
    return body;
}

async function readProject(path) {
    const value = JSON.parse(await readFile(resolve(path), 'utf8'));
    return value?.payload ?? value;
}

async function waitForRender(jobId) {
    const deadline = Date.now() + 5 * 60_000;
    let lastState;
    while (Date.now() < deadline) {
        const job = await request('Get render status', `/api/jobs/${encodeURIComponent(jobId)}`);
        const state = job.state ?? job.status;
        if (state !== lastState) {
            console.log(`  State: ${state ?? 'unknown'}`);
            lastState = state;
        }
        if (['completed', 'failed', 'cancelled'].includes(state)) return { ...job, state };
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
    throw new Error(`Timed out waiting for render ${jobId}. Check it in the Zvid app.`);
}

function expectObject(label, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} returned an unexpected response shape.`);
    }
}

function expectObjectProperty(label, value, property) {
    expectObject(label, value);
    expectObject(label, value[property]);
}

function expectArrayProperty(label, value, property) {
    expectObject(label, value);
    if (!Array.isArray(value[property])) {
        throw new Error(`${label} did not return an array at "${property}".`);
    }
}

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function printHelp() {
    console.log(`Usage: npm run test:production -- [--project <project.json>] [--render]

Without --render, the command authenticates with production and checks free/read-only
Zvid API contracts. It validates a production example project and spends no render credits.

--project <path>  Validate a local project JSON instead of the built-in production example.
--render          Submit the validated project to production, wait for it, and spend credits.

Set the API key only through the ZVID_API_KEY environment variable. The script never prints it.`);
}
