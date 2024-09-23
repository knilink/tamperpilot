import { TamperContext } from './utils/tamperContext';
import { dummyAuth, emptyCerts, buildType, nukeTelemetry } from './utils/presets';

const tctx = new TamperContext();

dummyAuth(tctx);
emptyCerts(tctx);
buildType(tctx, 'dev');
nukeTelemetry(tctx);

tctx.tamper('ConfigProvider', (instance) => {
  const baseUrl = process.argv.find((arg) => arg.startsWith('--baseUrl'))?.split('--baseUrl=')[1];
  const overrides: Record<string, string | undefined> = {
    'advanced.debug.overrideProxyUrl': baseUrl,
  };
  const _getConfig = instance.getConfig;
  instance.getConfig = function (key) {
    return (overrides[key as string] ?? _getConfig.call(this, key)) as any;
  };

  return instance;
});

tctx.tamper('OpenAIFetcher', (instance) => {
  const model = process.argv.find((arg) => arg.startsWith('--model'))?.split('--model=')[1];
  const stop = process.argv
    .filter((arg) => arg.startsWith('--stop='))
    .map((arg) => arg.split('--stop=')[1])
    .filter((arg) => !!arg);
  const addStop = process.argv
    .filter((arg) => arg.startsWith('--add-stop='))
    .map((arg) => arg.split('--add-stop=')[1])
    .filter((arg) => !!arg);
  const unsetStop = process.argv.some((arg) => arg.startsWith('--unset-stop='));
  const _fetchAndStreamCompletions = instance.fetchAndStreamCompletions;
  instance.fetchAndStreamCompletions = async function (
    ctx,
    completionParams,
    baseTelemetryData,
    finishedCb,
    cancellationToken
  ) {
    const postOptions: any = {};
    const engine = tctx.getByName('ConfigProvider').getOptionalConfig('advanced.debug.overrideEngine' as any);
    if (engine) {
      postOptions['model'] = engine;
    } else if (!!model) {
      postOptions['model'] = model;
    }
    if (unsetStop) {
      postOptions['stop'] = undefined;
    }
    if (!!stop.length) {
      postOptions['stop'] = stop;
    }
    if (!!addStop.length) {
      postOptions['stop'] ??= [];
      postOptions['stop'].push(...addStop);
    }
    return _fetchAndStreamCompletions.call(
      this,
      ctx,
      {
        ...completionParams,
        postOptions: {
          ...completionParams.postOptions,
          ...postOptions,
        } as any,
      },
      baseTelemetryData,
      finishedCb,
      cancellationToken
    );
  };

  return instance;
});

tctx.tamper('AvailableModelManager', (instance) => {
  instance.getModels = async (ctx) => {
    const token = await tctx.getByName('CopilotTokenManager').getCopilotToken(ctx);
    return {
      token,
      getModelIds() {
        return ['dummy-model-id'];
      },
      async getModelForResource() {
        return {
          modelId: 'dummy-model-id',
          forceBaseModel: false,
          path: '',
          headers: {},
        };
      },
    };
  };

  return instance;
});

export default tctx;
