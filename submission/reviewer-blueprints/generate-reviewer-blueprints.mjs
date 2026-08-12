import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'app#zvid-local-test-hapajf';
const CONNECTION_ID = 9700609;
const outputDirectory = dirname(fileURLToPath(import.meta.url));

const syntheticProject = {
  type: 'image',
  name: 'Zvid reviewer QA synthetic image',
  width: 1080,
  height: 1080,
  outputFormat: 'png',
  transparent: false,
  visuals: [
    {
      type: 'TEXT',
      html: '<p style="font-size:96px;font-weight:800;margin:0">Zvid reviewer QA</p><p style="font-size:36px;margin-top:24px">Synthetic test content</p>',
      position: 'center-center',
      width: 900,
      height: 900,
      style: {
        backgroundColor: '#5b21b6',
        borderRadius: '24px',
        color: '#ffffff',
        textAlign: 'center',
        fontFamily: 'Inter',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
  ],
};

const invalidProject = {
  type: 'image',
  name: 'Zvid reviewer QA invalid payload',
  width: 0,
  height: 0,
  outputFormat: 'png',
  visuals: [],
};

const projectJson = syntheticProject;
const invalidProjectJson = invalidProject;

function zvid(id, name, mapper = {}, x = 0, y = 0) {
  return {
    id,
    module: `${APP}:${name}`,
    version: 1,
    parameters: { __IMTCONN__: CONNECTION_ID },
    mapper,
    metadata: { designer: { x, y } },
  };
}

function sleep(id, duration, x = 0, y = 0) {
  return {
    id,
    module: 'util:FunctionSleep',
    version: 1,
    parameters: {},
    mapper: { duration: String(duration) },
    metadata: { designer: { x, y } },
  };
}

function router(id, routes, x = 300, y = 0) {
  return {
    id,
    module: 'builtin:BasicRouter',
    version: 1,
    mapper: null,
    metadata: { designer: { x, y } },
    routes: routes.map((flow) => ({ flow })),
  };
}

function scenario(name, flow, { instant = false } = {}) {
  return {
    name,
    flow,
    metadata: {
      instant,
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: true,
        slots: null,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false,
      },
      designer: { orphans: [] },
      zone: 'eu1.make.com',
      notes: [],
    },
  };
}

const authoringAndLibraries = scenario('Zvid App Review 1 - Authoring and libraries', [
  zvid(1, 'getCreditBalance', {}, 0, 0),
  router(2, [
    [
      zvid(3, 'planCreativeVideo', {
        brief: 'Create a synthetic 15-second launch video for an imaginary product named Aurora Lamp. Use no customer or personal data.',
        variationMode: 'fresh',
        exploreCount: 3,
        aspectRatio: '16:9',
        duration: 15,
        style: 'auto',
        motionIntensity: 'auto',
        preferredMedia: 'mixed',
      }, 600, -700),
      zvid(4, 'getProjectSchema', { target: 'project' }, 900, -700),
      zvid(5, 'listSupportedElements', {}, 1200, -700),
      zvid(6, 'getElementDocumentation', { elementType: 'TEXT' }, 1500, -700),
      zvid(7, 'getExampleProject', { name: 'promo-video' }, 1800, -700),
      zvid(8, 'repairProject', { projectJson }, 2100, -700),
    ],
    [
      zvid(9, 'searchCreativeAssets', {
        kind: 'shapes',
        query: '',
        limit: 101,
      }, 600, -450),
    ],
    [
      zvid(10, 'getCreativeAsset', {
        kind: 'examples',
        slug: 'ecom-hero-promo',
      }, 600, -200),
      zvid(11, 'getCreativeAssetContent', {
        kind: 'examples',
        slug: 'ecom-hero-promo',
      }, 900, -200),
    ],
    [
      zvid(12, 'getStockLibraryAvailability', {}, 600, 50),
      zvid(13, 'searchStockMedia', {
        type: 'image',
        query: 'abstract',
        limit: 61,
      }, 900, 50),
    ],
    [
      zvid(14, 'makeAnApiCall', {
        url: '/api/credits/balance',
        method: 'GET',
        headers: [],
        qs: [],
      }, 600, 300),
    ],
  ]),
]);

const accountSearches = scenario('Zvid App Review 1B - Account searches (clean account only)', [
  zvid(1, 'getCreditBalance', {}, 0, 0),
  router(2, [
    [zvid(3, 'searchRenders', { type: 'all', limit: 101 }, 600, -150)],
    [zvid(4, 'listTemplates', { limit: 101 }, 600, 150)],
  ]),
]);

const templateLifecycle = scenario('Zvid App Review 2 - Template lifecycle', [
  zvid(1, 'createTemplate', {
    name: 'Zvid Reviewer QA Synthetic Template 2026-08-11',
    description: 'Synthetic Make reviewer evidence. Contains no customer data.',
    projectJson,
  }, 0, 0),
  zvid(2, 'getTemplate', { templateId: '{{1.id}}' }, 300, 0),
  zvid(3, 'updateTemplate', {
    templateId: '{{1.id}}',
    description: 'Synthetic Make reviewer evidence updated during lifecycle QA.',
  }, 600, 0),
  zvid(4, 'previewTemplate', {
    templateId: '{{1.id}}',
    variables: {},
    overrides: {},
  }, 900, 0),
  zvid(5, 'duplicateTemplate', { templateId: '{{1.id}}' }, 1200, 0),
  zvid(6, 'renderFromTemplate', {
    templateId: '{{5.id}}',
    renderType: 'image',
    variables: {},
  }, 1500, 0),
  zvid(7, 'archiveTemplate', { templateId: '{{5.id}}' }, 1800, 0),
  zvid(8, 'archiveTemplate', { templateId: '{{1.id}}' }, 2100, 0),
]);

const singleRenderLifecycle = scenario('Zvid App Review 3 - Single render lifecycle', [
  zvid(1, 'getCreditBalance', {}, 0, 0),
  zvid(2, 'validateRender', {
    source: 'json',
    projectJson,
  }, 300, 0),
  zvid(3, 'createRender', {
    renderType: 'image',
    source: 'json',
    projectJson,
  }, 600, 0),
  sleep(4, 12, 900, 0),
  zvid(5, 'getRender', { jobId: '{{3.jobId}}' }, 1200, 0),
]);

const bulkRenderLifecycle = scenario('Zvid App Review 4 - Bulk render lifecycle', [
  zvid(1, 'getCreditBalance', {}, 0, 0),
  zvid(2, 'validateRender', { source: 'json', projectJson }, 300, 0),
  zvid(3, 'createBulkRender', {
    renderType: 'image',
    source: 'json',
    projectJson,
    items: [
      { name: 'zvid-reviewer-qa-bulk-a', variables: {} },
      { name: 'zvid-reviewer-qa-bulk-b', variables: {} },
    ],
    batchName: 'Zvid reviewer QA synthetic bulk',
  }, 600, 0),
  sleep(4, 15, 900, 0),
  zvid(5, 'getBulkRender', { bulkId: '{{3.bulkId}}' }, 1200, 0),
]);

function errorHandling(routeOrder) {
  const routes = {
    validate: [zvid(3, 'validateRender', {
      source: 'json',
      projectJson: invalidProjectJson,
    }, 600, -250)],
    api: [zvid(4, 'makeAnApiCall', {
      url: '/api/reviewer-qa/not-found',
      method: 'GET',
      headers: [],
      qs: [],
    }, 600, 0)],
    template: [zvid(5, 'getTemplate', {
      templateId: 'tpl_ffffffffffffffffffff',
    }, 600, 250)],
  };

  return scenario('Zvid App Review 5 - Error handling', [
    zvid(1, 'getCreditBalance', {}, 0, 0),
    router(2, routeOrder.map((key) => routes[key])),
  ]);
}

const renderEventTrigger = scenario('Zvid App Review 6 - Render event trigger', [
  {
    id: 1,
    module: `${APP}:watchRenderEvents`,
    version: 1,
    parameters: { __IMTCONN__: CONNECTION_ID, __IMTHOOK__: 0 },
    mapper: {},
    metadata: { designer: { x: 0, y: 0 } },
  },
], { instant: true });

const outputs = new Map([
  ['01-authoring-and-libraries.blueprint.json', authoringAndLibraries],
  ['01b-account-searches-clean-account-only.blueprint.json', accountSearches],
  ['02-template-lifecycle.blueprint.json', templateLifecycle],
  ['03-single-render-lifecycle.blueprint.json', singleRenderLifecycle],
  ['04-bulk-render-lifecycle.blueprint.json', bulkRenderLifecycle],
  ['05-error-handling.blueprint.json', errorHandling(['validate', 'api', 'template'])],
  ['05b-error-handling-template-first.blueprint.json', errorHandling(['template', 'api', 'validate'])],
  ['05c-error-handling-api-first.blueprint.json', errorHandling(['api', 'template', 'validate'])],
  ['06-render-event-trigger.blueprint.json', renderEventTrigger],
]);

await mkdir(outputDirectory, { recursive: true });
for (const [filename, blueprint] of outputs) {
  await writeFile(join(outputDirectory, filename), `${JSON.stringify(blueprint, null, 2)}\n`, 'utf8');
}

console.log(`Generated ${outputs.size} reviewer blueprints.`);
