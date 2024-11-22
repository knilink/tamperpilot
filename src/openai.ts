import { TamperContext } from './utils/tamperContext';
import { dummyAuth, emptyCerts, buildType, nukeTelemetry } from './utils/presets';

const tctx = new TamperContext();

dummyAuth(tctx);
emptyCerts(tctx);
buildType(tctx, 'dev');
nukeTelemetry(tctx);

function getArgs(flag: string): string[] {
  return process.argv
    .filter((arg) => arg.startsWith(`${flag}=`))
    .map((arg) => arg.split(`${flag}=`)[1])
    .filter((arg) => !!arg);
}

function hasFlag(flag: string): boolean {
  return process.argv.some((arg) => arg.startsWith(flag));
}

tctx.tamper('ConfigProvider', (instance) => {
  const baseUrl = getArgs('--baseUrl')[0];
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
  const stop = getArgs('--stop');
  const addStop = getArgs('--add-stop');
  const unsetStop = hasFlag('--unset-stop');
  const _maxSuffixLines = getArgs('--max-suffix-length')[0];
  const maxSuffixLines = _maxSuffixLines ? parseInt(_maxSuffixLines) : undefined;

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

    let suffix = completionParams.prompt?.suffix;
    if (maxSuffixLines) {
      suffix = (suffix ?? '').split('\n').slice(0, maxSuffixLines).join('\n');
    }

    return _fetchAndStreamCompletions.call(
      this,
      ctx,
      {
        ...completionParams,
        prompt: {
          ...completionParams.prompt,
          suffix,
        },
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
